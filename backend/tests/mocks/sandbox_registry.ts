import { randomUUID } from 'node:crypto'
import type { SandboxManager } from '#agent/sandbox/index'
import type { DebugSandboxEntry } from '#services/sandbox_registry'
import { MockSandboxManager } from '#tests/mocks/sandbox_manager'

type InvocationRecord = {
  invocationId: string
  workspaceId: string
  userId: string
  authToken: string
  authTokenId: string
  correlationId: string
  status: 'ready' | 'shutdown' | 'error'
  manager: MockSandboxManager
}

type DebugRecord = {
  workspaceId: string
  userId: string
  tokenId: string
  authToken: string
  correlationId: string
  status: 'ready' | 'shutdown' | 'error'
  cwd: string
  manager: MockSandboxManager
}

export class FakeSandboxRegistry {
  private invocationRecords = new Map<string, InvocationRecord>()
  private debugRecords = new Map<string, DebugRecord>()
  private workspaceInvocations = new Map<string, Set<string>>()

  getInvocationRecord(invocationId: string): InvocationRecord | null {
    return this.invocationRecords.get(invocationId) ?? null
  }

  reset(): void {
    this.invocationRecords.clear()
    this.debugRecords.clear()
    this.workspaceInvocations.clear()
  }

  private ensureWorkspaceSet(workspaceId: string): Set<string> {
    const existing = this.workspaceInvocations.get(workspaceId)
    if (existing) {
      return existing
    }

    const created = new Set<string>()
    this.workspaceInvocations.set(workspaceId, created)
    return created
  }

  async getInvocationSandbox(invocationId: string): Promise<SandboxManager | undefined> {
    const record = this.invocationRecords.get(invocationId)
    if (!record || record.status === 'shutdown' || record.status === 'error') {
      return undefined
    }

    return record.manager
  }

  async hasInvocation(invocationId: string): Promise<boolean> {
    const record = this.invocationRecords.get(invocationId)
    return !!record && record.status !== 'shutdown' && record.status !== 'error'
  }

  async hasInvocationForWorkspace(workspaceId: string): Promise<boolean> {
    const ids = this.workspaceInvocations.get(workspaceId)
    return !!ids && ids.size > 0
  }

  async createInvocationSandbox(options: {
    invocationId: string
    workspaceId: string
    userId: string
    authToken: string
    authTokenId: string | number | BigInt
    correlationId: string
  }): Promise<SandboxManager> {
    const existing = this.invocationRecords.get(options.invocationId)
    if (existing && existing.status !== 'shutdown' && existing.status !== 'error') {
      return existing.manager
    }

    if (existing) {
      this.invocationRecords.delete(options.invocationId)
    }

    const manager = new MockSandboxManager()
    manager.setInitOptions({
      workspaceId: options.workspaceId,
      authToken: options.authToken,
      userId: options.userId,
      correlationId: options.correlationId,
    })
    await manager.ensureInitialized()

    const record: InvocationRecord = {
      invocationId: options.invocationId,
      workspaceId: options.workspaceId,
      userId: options.userId,
      authToken: options.authToken,
      authTokenId: options.authTokenId.toString(),
      correlationId: options.correlationId,
      status: 'ready',
      manager,
    }

    this.invocationRecords.set(options.invocationId, record)
    this.ensureWorkspaceSet(options.workspaceId).add(options.invocationId)
    return manager
  }

  async shutdownInvocationSandbox(
    invocationId: string,
    _options: { deleteAuthToken?: boolean } = { deleteAuthToken: true }
  ): Promise<void> {
    const record = this.invocationRecords.get(invocationId)
    if (!record) {
      return
    }

    try {
      await record.manager.shutdown()
    } catch {
      // Ignore shutdown failures
    }

    record.status = 'shutdown'
    const workspaceSet = this.workspaceInvocations.get(record.workspaceId)
    if (workspaceSet) {
      workspaceSet.delete(invocationId)
      if (workspaceSet.size === 0) {
        this.workspaceInvocations.delete(record.workspaceId)
      }
    }
  }

  async getDebugSandbox(workspaceId: string): Promise<DebugSandboxEntry | undefined> {
    const record = this.debugRecords.get(workspaceId)
    if (!record || record.status === 'shutdown' || record.status === 'error') {
      return undefined
    }

    return {
      manager: record.manager,
      cwd: record.cwd,
      tokenId: record.tokenId,
      userId: record.userId,
      workspaceId: record.workspaceId,
    }
  }

  async hasDebugSandbox(workspaceId: string): Promise<boolean> {
    const record = this.debugRecords.get(workspaceId)
    return !!record && record.status !== 'shutdown' && record.status !== 'error'
  }

  async getOrCreateDebugSandbox(workspaceId: string, userId: string): Promise<DebugSandboxEntry> {
    const existing = this.debugRecords.get(workspaceId)
    if (existing && existing.status !== 'shutdown' && existing.status !== 'error') {
      return {
        manager: existing.manager,
        cwd: existing.cwd,
        tokenId: existing.tokenId,
        userId: existing.userId,
        workspaceId: existing.workspaceId,
      }
    }

    if (existing) {
      this.debugRecords.delete(workspaceId)
    }

    const tokenId = randomUUID()
    const authToken = randomUUID()
    const correlationId = randomUUID()
    const manager = new MockSandboxManager()
    manager.setInitOptions({
      workspaceId,
      authToken,
      userId,
      correlationId,
    })
    await manager.ensureInitialized()

    const record: DebugRecord = {
      workspaceId,
      userId,
      tokenId,
      authToken,
      correlationId,
      status: 'ready',
      cwd: '/workspace',
      manager,
    }

    this.debugRecords.set(workspaceId, record)

    return {
      manager,
      cwd: record.cwd,
      tokenId: record.tokenId,
      userId: record.userId,
      workspaceId: record.workspaceId,
    }
  }

  async updateDebugCwd(workspaceId: string, cwd: string): Promise<void> {
    const record = this.debugRecords.get(workspaceId)
    if (!record) {
      return
    }

    record.cwd = cwd
  }

  async shutdownDebugSandbox(
    workspaceId: string,
    _options: { deleteAuthToken?: boolean } = { deleteAuthToken: true }
  ): Promise<boolean> {
    const record = this.debugRecords.get(workspaceId)
    if (!record) {
      return false
    }

    try {
      await record.manager.shutdown()
    } catch {
      // Ignore shutdown failures
    }

    record.status = 'shutdown'
    return true
  }
}

export const fakeSandboxRegistry = new FakeSandboxRegistry()
