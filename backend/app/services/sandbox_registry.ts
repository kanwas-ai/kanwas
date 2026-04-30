import { randomUUID } from 'node:crypto'
import { SandboxManager, type SandboxStartupConfig } from '#agent/sandbox/index'
import User from '#models/user'
import agentConfig from '#config/agent'
import redis from '@adonisjs/redis/services/main'

type SandboxProvider = 'docker' | 'e2b'

interface InvocationSandboxRecord {
  type: 'invocation'
  invocationId: string
  lifecycleId?: string
  workspaceId: string
  userId: string
  tokenId: string
  authToken: string
  correlationId: string
  provider: SandboxProvider
  status: 'initializing' | 'ready' | 'shutdown' | 'error'
  sandboxId?: string | null
  shutdownRequested?: boolean
  errorMessage?: string
  createdAt: number
  updatedAt: number
  shutdownAt?: number
}

interface DebugSandboxRecord {
  type: 'debug'
  workspaceId: string
  userId: string
  tokenId: string
  authToken: string
  correlationId: string
  provider: SandboxProvider
  status: 'initializing' | 'ready' | 'shutdown' | 'error'
  sandboxId?: string | null
  shutdownRequested?: boolean
  errorMessage?: string
  cwd: string
  createdAt: number
  updatedAt: number
  shutdownAt?: number
}

export interface DebugSandboxEntry {
  manager: SandboxManager
  cwd: string
  tokenId: string
  userId: string
  workspaceId: string
}

const REGISTRY_PREFIX = 'sandbox_registry'
const SHUTDOWN_TTL_SECONDS = 60 * 60
const INVOCATION_STARTUP_CONFIG: SandboxStartupConfig = {
  readinessTimeoutMs: 60_000,
}
const DEBUG_STARTUP_CONFIG: SandboxStartupConfig = {
  readinessTimeoutMs: 30_000,
}

export const sandboxRegistryKeys = {
  invocation: (invocationId: string) => `${REGISTRY_PREFIX}:invocation:${invocationId}`,
  workspaceInvocations: (workspaceId: string) => `${REGISTRY_PREFIX}:workspace_invocations:${workspaceId}`,
  debug: (workspaceId: string) => `${REGISTRY_PREFIX}:debug:${workspaceId}`,
}

export class SandboxRegistry {
  private readonly invocationManagers = new Map<string, { lifecycleId: string; manager: SandboxManager }>()
  private readonly invocationInitTasks = new Map<string, Promise<void>>()

  constructor() {}

  private getSandboxProvider(): SandboxProvider {
    return (process.env.SANDBOX_PROVIDER as SandboxProvider) || 'docker'
  }

  private buildSandboxManager(provider: SandboxProvider, startup: SandboxStartupConfig): SandboxManager {
    return new SandboxManager({
      provider,
      yjsServerHost: process.env.YJS_SERVER_HOST || 'localhost:1999',
      yjsServerProtocol: provider === 'e2b' ? 'wss' : 'ws',
      backendUrl: process.env.BACKEND_URL || 'http://localhost:3333',
      assemblyaiApiKey: agentConfig.assemblyaiApiKey,
      sentryDsn: process.env.SANDBOX_SENTRY_DSN,
      startup,
    })
  }

  private async deleteAuthToken(userId: string, tokenId: string): Promise<void> {
    const user = await User.find(userId)
    if (!user) {
      return
    }

    try {
      await User.accessTokens.delete(user, tokenId)
    } catch {
      // Ignore missing/expired tokens
    }
  }

  private serializeTokenId(tokenId: string | number | bigint | BigInt): string {
    return tokenId.toString()
  }

  private async getInvocationRecord(invocationId: string): Promise<InvocationSandboxRecord | null> {
    const data = await redis.get(sandboxRegistryKeys.invocation(invocationId))
    if (!data) {
      return null
    }

    try {
      return JSON.parse(data) as InvocationSandboxRecord
    } catch {
      return null
    }
  }

  private getInvocationLifecycleId(record: InvocationSandboxRecord): string {
    return record.lifecycleId ?? ''
  }

  private invocationInitTaskKey(invocationId: string, lifecycleId: string): string {
    return `${invocationId}:${lifecycleId}`
  }

  private async saveInvocationRecordIfLifecycle(
    record: InvocationSandboxRecord,
    ttlSeconds?: number
  ): Promise<boolean> {
    const result = await redis.eval(
      `
local current = redis.call("GET", KEYS[1])
if not current then
  return 0
end
local decoded = cjson.decode(current)
local lifecycle_id = decoded["lifecycleId"] or ""
if lifecycle_id ~= ARGV[1] then
  return 0
end
if ARGV[3] ~= "" then
  redis.call("SET", KEYS[1], ARGV[2], "EX", tonumber(ARGV[3]))
else
  redis.call("SET", KEYS[1], ARGV[2])
end
return 1
      `,
      1,
      sandboxRegistryKeys.invocation(record.invocationId),
      this.getInvocationLifecycleId(record),
      JSON.stringify(record),
      ttlSeconds ? String(ttlSeconds) : ''
    )

    return Number(result) === 1
  }

  private async deleteInvocationRecordIfLifecycle(record: InvocationSandboxRecord): Promise<boolean> {
    const result = await redis.eval(
      `
local current = redis.call("GET", KEYS[1])
if not current then
  return 0
end
local decoded = cjson.decode(current)
local lifecycle_id = decoded["lifecycleId"] or ""
if lifecycle_id ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
return 1
      `,
      1,
      sandboxRegistryKeys.invocation(record.invocationId),
      this.getInvocationLifecycleId(record)
    )

    return Number(result) === 1
  }

  private async updateInvocationRecord(
    invocationId: string,
    update: Partial<InvocationSandboxRecord>,
    lifecycleId?: string
  ): Promise<InvocationSandboxRecord | null> {
    const record = await this.getInvocationRecord(invocationId)
    if (!record) {
      return null
    }

    if (lifecycleId !== undefined && this.getInvocationLifecycleId(record) !== lifecycleId) {
      return null
    }

    // Don't mutate terminal records - preserves TTL and avoids resurrection.
    if (record.status === 'shutdown' || record.status === 'error') {
      return record
    }

    const updated: InvocationSandboxRecord = {
      ...record,
      ...update,
      updatedAt: Date.now(),
    }

    const saved = await this.saveInvocationRecordIfLifecycle(updated)
    return saved ? updated : null
  }

  private async markInvocationShutdown(record: InvocationSandboxRecord): Promise<boolean> {
    const updated: InvocationSandboxRecord = {
      ...record,
      status: 'shutdown',
      authToken: '',
      shutdownAt: Date.now(),
      updatedAt: Date.now(),
    }

    const saved = await this.saveInvocationRecordIfLifecycle(updated, SHUTDOWN_TTL_SECONDS)
    if (!saved) {
      return false
    }

    await redis.srem(sandboxRegistryKeys.workspaceInvocations(record.workspaceId), record.invocationId)
    return true
  }

  private async getDebugRecord(workspaceId: string): Promise<DebugSandboxRecord | null> {
    const data = await redis.get(sandboxRegistryKeys.debug(workspaceId))
    if (!data) {
      return null
    }

    try {
      return JSON.parse(data) as DebugSandboxRecord
    } catch {
      return null
    }
  }

  private async saveDebugRecord(record: DebugSandboxRecord, ttlSeconds?: number): Promise<void> {
    const key = sandboxRegistryKeys.debug(record.workspaceId)
    const payload = JSON.stringify(record)
    if (ttlSeconds) {
      await redis.set(key, payload, 'EX', ttlSeconds)
      return
    }
    await redis.set(key, payload)
  }

  private async updateDebugRecord(
    workspaceId: string,
    update: Partial<DebugSandboxRecord>
  ): Promise<DebugSandboxRecord | null> {
    const record = await this.getDebugRecord(workspaceId)
    if (!record) {
      return null
    }

    // Don't mutate terminal records - preserves TTL and avoids resurrection.
    if (record.status === 'shutdown' || record.status === 'error') {
      return record
    }

    const updated: DebugSandboxRecord = {
      ...record,
      ...update,
      updatedAt: Date.now(),
    }

    await this.saveDebugRecord(updated)
    return updated
  }

  private async markDebugShutdown(record: DebugSandboxRecord): Promise<void> {
    const updated: DebugSandboxRecord = {
      ...record,
      status: 'shutdown',
      authToken: '',
      shutdownAt: Date.now(),
      updatedAt: Date.now(),
    }

    await this.saveDebugRecord(updated, SHUTDOWN_TTL_SECONDS)
  }

  private buildInvocationManagerFromRecord(record: InvocationSandboxRecord): SandboxManager {
    const lifecycleId = this.getInvocationLifecycleId(record)
    const manager = this.buildSandboxManager(record.provider, INVOCATION_STARTUP_CONFIG)
    manager.setInitOptions({
      workspaceId: record.workspaceId,
      authToken: record.authToken || '',
      userId: record.userId,
      correlationId: record.correlationId,
      sandboxId: record.sandboxId ?? undefined,
      onSandboxId: (sandboxId) => {
        void this.updateInvocationRecord(record.invocationId, { sandboxId }, lifecycleId).catch(() => {})
      },
    })
    return manager
  }

  private buildDebugManagerFromRecord(record: DebugSandboxRecord): SandboxManager {
    const manager = this.buildSandboxManager(record.provider, DEBUG_STARTUP_CONFIG)
    manager.setInitOptions({
      workspaceId: record.workspaceId,
      authToken: record.authToken || '',
      userId: record.userId,
      correlationId: record.correlationId,
      sandboxId: record.sandboxId ?? undefined,
      onSandboxId: (sandboxId) => {
        void this.updateDebugRecord(record.workspaceId, { sandboxId }).catch(() => {})
      },
    })
    return manager
  }

  private getCachedInvocationManager(invocationId: string, lifecycleId: string): SandboxManager | undefined {
    const cached = this.invocationManagers.get(invocationId)
    if (!cached || cached.lifecycleId !== lifecycleId) {
      return undefined
    }

    return cached.manager
  }

  private cacheInvocationManager(invocationId: string, lifecycleId: string, manager: SandboxManager): SandboxManager {
    this.invocationManagers.set(invocationId, { lifecycleId, manager })
    return manager
  }

  private clearInvocationCache(invocationId: string, lifecycleId?: string): void {
    const cached = this.invocationManagers.get(invocationId)
    if (!lifecycleId || cached?.lifecycleId === lifecycleId) {
      this.invocationManagers.delete(invocationId)
    }

    if (!lifecycleId) {
      for (const key of this.invocationInitTasks.keys()) {
        if (key.startsWith(`${invocationId}:`)) {
          this.invocationInitTasks.delete(key)
        }
      }
      return
    }

    this.invocationInitTasks.delete(this.invocationInitTaskKey(invocationId, lifecycleId))
  }

  private startInvocationInitialization(invocationId: string, lifecycleId: string, manager: SandboxManager): void {
    const taskKey = this.invocationInitTaskKey(invocationId, lifecycleId)
    const existingTask = this.invocationInitTasks.get(taskKey)
    if (existingTask) {
      return
    }

    const task = this.initializeInvocationSandbox(invocationId, lifecycleId, manager).finally(() => {
      const currentTask = this.invocationInitTasks.get(taskKey)
      if (currentTask === task) {
        this.invocationInitTasks.delete(taskKey)
      }
    })

    this.invocationInitTasks.set(taskKey, task)
    void task
  }

  private async initializeInvocationSandbox(
    invocationId: string,
    lifecycleId: string,
    manager: SandboxManager
  ): Promise<void> {
    try {
      await manager.ensureInitialized()
      const sandboxId = manager.getSandboxId()
      const updated = await this.updateInvocationRecord(
        invocationId,
        {
          status: 'ready',
          sandboxId: sandboxId ?? null,
        },
        lifecycleId
      )

      if (!updated) {
        // A newer lifecycle replaced this one while it was initializing.
        await manager.shutdown()
        this.clearInvocationCache(invocationId, lifecycleId)
        return
      }

      const record = updated
      if (!record) {
        // Record was deleted while we were initializing - don't leak a sandbox.
        await manager.shutdown()
        this.clearInvocationCache(invocationId, lifecycleId)
        return
      }

      if (record.status === 'shutdown' || record.status === 'error' || record.shutdownRequested) {
        await manager.shutdown()
        if (record.status !== 'error') {
          await this.markInvocationShutdown(record)
        }
        this.clearInvocationCache(invocationId, lifecycleId)
      }
    } catch (error) {
      const existing = await this.getInvocationRecord(invocationId)
      if (!existing) {
        this.clearInvocationCache(invocationId, lifecycleId)
        return
      }

      if (this.getInvocationLifecycleId(existing) !== lifecycleId) {
        try {
          await manager.shutdown()
        } catch {
          // Ignore shutdown failures after stale init
        }
        this.clearInvocationCache(invocationId, lifecycleId)
        return
      }

      if (existing.status === 'shutdown' || existing.status === 'error') {
        this.clearInvocationCache(invocationId, lifecycleId)
        return
      }

      const startupError = error instanceof Error ? error : new Error(String(error))

      await this.updateInvocationRecord(
        invocationId,
        {
          status: 'error',
          sandboxId: manager.getSandboxId(),
          errorMessage: startupError.message,
        },
        lifecycleId
      )

      manager.setInitializationError(startupError)

      try {
        await manager.shutdown()
      } catch {
        // Ignore shutdown failures after failed init
      }

      this.clearInvocationCache(invocationId, lifecycleId)
    }
  }

  private async initializeDebugSandbox(workspaceId: string, manager: SandboxManager): Promise<void> {
    try {
      await manager.ensureInitialized()
      const sandboxId = manager.getSandboxId()
      const updated = await this.updateDebugRecord(workspaceId, {
        status: 'ready',
        sandboxId: sandboxId ?? null,
      })

      const record = updated ?? (await this.getDebugRecord(workspaceId))
      if (!record) {
        // Record was deleted while we were initializing - don't leak a sandbox.
        await manager.shutdown()
        return
      }

      if (record.status === 'shutdown' || record.shutdownRequested) {
        await manager.shutdown()
        await this.markDebugShutdown(record)
      }
    } catch (error) {
      const updated = await this.updateDebugRecord(workspaceId, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })

      await redis.expire(sandboxRegistryKeys.debug(workspaceId), SHUTDOWN_TTL_SECONDS)

      if (updated) {
        await this.deleteAuthToken(updated.userId, updated.tokenId)
      }

      try {
        await manager.shutdown()
      } catch {
        // Ignore shutdown failures after failed init
      }

      throw error
    }
  }

  async getInvocationSandbox(invocationId: string): Promise<SandboxManager | undefined> {
    const record = await this.getInvocationRecord(invocationId)
    if (!record || record.status === 'shutdown' || record.status === 'error') {
      this.clearInvocationCache(invocationId, record ? this.getInvocationLifecycleId(record) : undefined)
      return undefined
    }

    const lifecycleId = this.getInvocationLifecycleId(record)
    const cached = this.getCachedInvocationManager(invocationId, lifecycleId)
    if (cached) {
      if (record.status === 'initializing') {
        this.startInvocationInitialization(invocationId, lifecycleId, cached)
      }
      return cached
    }

    const manager = this.cacheInvocationManager(
      invocationId,
      lifecycleId,
      this.buildInvocationManagerFromRecord(record)
    )
    if (record.status === 'initializing') {
      this.startInvocationInitialization(invocationId, lifecycleId, manager)
    }

    return manager
  }

  async hasInvocation(invocationId: string): Promise<boolean> {
    const record = await this.getInvocationRecord(invocationId)
    return !!record && record.status !== 'shutdown' && record.status !== 'error'
  }

  async hasInvocationForWorkspace(workspaceId: string): Promise<boolean> {
    const count = await redis.scard(sandboxRegistryKeys.workspaceInvocations(workspaceId))
    return count > 0
  }

  async createInvocationSandbox(options: {
    invocationId: string
    workspaceId: string
    userId: string
    authToken: string
    authTokenId: string | number | BigInt
    correlationId: string
  }): Promise<SandboxManager> {
    const provider = this.getSandboxProvider()
    const now = Date.now()
    const record: InvocationSandboxRecord = {
      type: 'invocation',
      invocationId: options.invocationId,
      lifecycleId: randomUUID(),
      workspaceId: options.workspaceId,
      userId: options.userId,
      tokenId: this.serializeTokenId(options.authTokenId),
      authToken: options.authToken,
      correlationId: options.correlationId,
      provider,
      status: 'initializing',
      createdAt: now,
      updatedAt: now,
    }

    const key = sandboxRegistryKeys.invocation(options.invocationId)
    const setResult = await redis.set(key, JSON.stringify(record), 'NX')

    if (setResult === 'OK') {
      await redis.sadd(sandboxRegistryKeys.workspaceInvocations(options.workspaceId), options.invocationId)
      const manager = this.cacheInvocationManager(
        options.invocationId,
        this.getInvocationLifecycleId(record),
        this.buildSandboxManager(provider, INVOCATION_STARTUP_CONFIG)
      )
      manager.setInitOptions({
        workspaceId: options.workspaceId,
        authToken: options.authToken,
        userId: options.userId,
        correlationId: options.correlationId,
        onSandboxId: (sandboxId) => {
          void this.updateInvocationRecord(
            options.invocationId,
            { sandboxId },
            this.getInvocationLifecycleId(record)
          ).catch(() => {})
        },
      })

      this.startInvocationInitialization(options.invocationId, this.getInvocationLifecycleId(record), manager)

      return manager
    }

    const existing = await this.getInvocationRecord(options.invocationId)
    if (!existing) {
      return this.createInvocationSandbox(options)
    }

    if (existing.status === 'shutdown' || existing.status === 'error') {
      this.clearInvocationCache(options.invocationId, this.getInvocationLifecycleId(existing))
      await this.deleteInvocationRecordIfLifecycle(existing)
      return this.createInvocationSandbox(options)
    }

    const existingLifecycleId = this.getInvocationLifecycleId(existing)
    const existingManager = this.getCachedInvocationManager(options.invocationId, existingLifecycleId)
    if (existingManager) {
      if (existing.status === 'initializing') {
        this.startInvocationInitialization(options.invocationId, existingLifecycleId, existingManager)
      }
      return existingManager
    }

    const manager = this.cacheInvocationManager(
      options.invocationId,
      existingLifecycleId,
      this.buildInvocationManagerFromRecord(existing)
    )
    if (existing.status === 'initializing') {
      this.startInvocationInitialization(options.invocationId, existingLifecycleId, manager)
    }

    return manager
  }

  async shutdownInvocationSandbox(
    invocationId: string,
    options: { deleteAuthToken?: boolean } = { deleteAuthToken: true }
  ): Promise<void> {
    const record = await this.getInvocationRecord(invocationId)
    if (!record) {
      this.clearInvocationCache(invocationId)
      return
    }

    const lifecycleId = this.getInvocationLifecycleId(record)

    if (record.status === 'error') {
      if (options.deleteAuthToken !== false) {
        await this.deleteAuthToken(record.userId, record.tokenId)
      }

      const saved = await this.saveInvocationRecordIfLifecycle(
        {
          ...record,
          authToken: '',
          shutdownAt: Date.now(),
          updatedAt: Date.now(),
        },
        SHUTDOWN_TTL_SECONDS
      )

      if (saved) {
        await redis.srem(sandboxRegistryKeys.workspaceInvocations(record.workspaceId), record.invocationId)
      }
      this.clearInvocationCache(invocationId, lifecycleId)
      return
    }

    const cachedManager = this.getCachedInvocationManager(invocationId, lifecycleId)
    const manager = cachedManager ?? (record.sandboxId ? this.buildInvocationManagerFromRecord(record) : null)
    const marked = await this.markInvocationShutdown(record)
    if (!marked) {
      this.clearInvocationCache(invocationId, lifecycleId)
      return
    }

    this.clearInvocationCache(invocationId, lifecycleId)

    if (options.deleteAuthToken !== false) {
      await this.deleteAuthToken(record.userId, record.tokenId)
    }

    if (!manager) {
      return
    }

    try {
      await manager.ensureInitialized()
    } catch {
      // Ignore initialization failures during shutdown
    }

    try {
      await manager.shutdown()
    } catch {
      // Ignore shutdown failures
    }
  }

  async getDebugSandbox(workspaceId: string): Promise<DebugSandboxEntry | undefined> {
    const record = await this.getDebugRecord(workspaceId)
    if (!record || record.status === 'shutdown' || record.status === 'error') {
      return undefined
    }

    return {
      manager: this.buildDebugManagerFromRecord(record),
      cwd: record.cwd,
      tokenId: record.tokenId,
      userId: record.userId,
      workspaceId: record.workspaceId,
    }
  }

  async hasDebugSandbox(workspaceId: string): Promise<boolean> {
    const record = await this.getDebugRecord(workspaceId)
    return !!record && record.status !== 'shutdown' && record.status !== 'error'
  }

  async getOrCreateDebugSandbox(workspaceId: string, userId: string): Promise<DebugSandboxEntry> {
    const existing = await this.getDebugRecord(workspaceId)
    if (existing) {
      if (existing.status === 'shutdown' || existing.status === 'error') {
        await redis.del(sandboxRegistryKeys.debug(workspaceId))
      } else {
        return {
          manager: this.buildDebugManagerFromRecord(existing),
          cwd: existing.cwd,
          tokenId: existing.tokenId,
          userId: existing.userId,
          workspaceId: existing.workspaceId,
        }
      }
    }

    const user = await User.find(userId)
    if (!user) {
      throw new Error(`User not found: ${userId}`)
    }

    const accessToken = await User.accessTokens.create(user, [`workspace:${workspaceId}:sandbox`], {
      expiresIn: '2 hours',
    })
    const provider = this.getSandboxProvider()
    const now = Date.now()
    const record: DebugSandboxRecord = {
      type: 'debug',
      workspaceId,
      userId,
      tokenId: this.serializeTokenId(accessToken.identifier),
      authToken: accessToken.value!.release(),
      correlationId: randomUUID(),
      provider,
      status: 'initializing',
      cwd: '/workspace',
      createdAt: now,
      updatedAt: now,
    }

    const setResult = await redis.set(sandboxRegistryKeys.debug(workspaceId), JSON.stringify(record), 'NX')
    if (setResult !== 'OK') {
      const refreshed = await this.getDebugRecord(workspaceId)
      if (!refreshed) {
        return this.getOrCreateDebugSandbox(workspaceId, userId)
      }

      if (refreshed.status === 'shutdown' || refreshed.status === 'error') {
        await redis.del(sandboxRegistryKeys.debug(workspaceId))
        return this.getOrCreateDebugSandbox(workspaceId, userId)
      }

      return {
        manager: this.buildDebugManagerFromRecord(refreshed),
        cwd: refreshed.cwd,
        tokenId: refreshed.tokenId,
        userId: refreshed.userId,
        workspaceId: refreshed.workspaceId,
      }
    }

    const manager = this.buildSandboxManager(provider, DEBUG_STARTUP_CONFIG)
    manager.setInitOptions({
      workspaceId,
      authToken: record.authToken,
      userId,
      correlationId: record.correlationId,
      onSandboxId: (sandboxId) => {
        void this.updateDebugRecord(workspaceId, { sandboxId }).catch(() => {})
      },
    })

    await this.initializeDebugSandbox(workspaceId, manager)

    return {
      manager,
      cwd: record.cwd,
      tokenId: record.tokenId,
      userId: record.userId,
      workspaceId: record.workspaceId,
    }
  }

  async updateDebugCwd(workspaceId: string, cwd: string): Promise<void> {
    await this.updateDebugRecord(workspaceId, { cwd })
  }

  async shutdownDebugSandbox(
    workspaceId: string,
    options: { deleteAuthToken?: boolean } = { deleteAuthToken: true }
  ): Promise<boolean> {
    const record = await this.getDebugRecord(workspaceId)
    if (!record) {
      return false
    }

    if (!record.sandboxId) {
      const updated = await this.updateDebugRecord(workspaceId, { shutdownRequested: true })
      const recordToShutdown = updated ?? record
      if (options.deleteAuthToken !== false) {
        await this.deleteAuthToken(recordToShutdown.userId, recordToShutdown.tokenId)
      }
      await this.markDebugShutdown(recordToShutdown)
      return true
    }

    const manager = this.buildDebugManagerFromRecord(record)
    try {
      await manager.ensureInitialized()
    } catch {
      // Ignore initialization failures during shutdown
    }

    try {
      await manager.shutdown()
    } catch {
      // Ignore shutdown failures
    }

    if (options.deleteAuthToken !== false) {
      await this.deleteAuthToken(record.userId, record.tokenId)
    }

    await this.markDebugShutdown(record)
    return true
  }
}
