import { test } from '@japa/runner'
import sinon from 'sinon'
import redis from '@adonisjs/redis/services/main'
import { SandboxManager, type SandboxConfig, type SandboxInitOptions } from '#agent/sandbox/index'
import { SandboxRegistry, sandboxRegistryKeys } from '#services/sandbox_registry'

const SANDBOX_CONFIG: SandboxConfig = {
  provider: 'docker',
  yjsServerHost: 'localhost:1999',
  yjsServerProtocol: 'ws',
  backendUrl: 'http://localhost:3333',
}

type Deferred<T = void> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T = void>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  let reject!: Deferred<T>['reject']
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 500): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error('Timed out waiting for condition')
}

class ControlledSandboxManager extends SandboxManager {
  capturedInitOptions: SandboxInitOptions | null = null
  initialized = false
  ensureCalls = 0
  shutdownCalls = 0
  shutdownStarted = false
  ensureDeferred: Deferred | null = null
  shutdownDeferred: Deferred | null = null

  constructor(readonly sandboxId: string) {
    super(SANDBOX_CONFIG)
  }

  override setInitOptions(options: SandboxInitOptions): void {
    super.setInitOptions(options)
    this.capturedInitOptions = options
  }

  override async ensureInitialized(): Promise<void> {
    this.ensureCalls += 1
    if (this.ensureDeferred) {
      await this.ensureDeferred.promise
    }
    this.initialized = true
    this.capturedInitOptions?.onSandboxId?.(this.sandboxId)
  }

  override isInitialized(): boolean {
    return this.initialized
  }

  override getSandboxId(): string | null {
    return this.sandboxId
  }

  override async shutdown(): Promise<void> {
    this.shutdownCalls += 1
    this.shutdownStarted = true
    if (this.shutdownDeferred) {
      await this.shutdownDeferred.promise
    }
    this.initialized = false
  }
}

function installRedisHarness() {
  const values = new Map<string, string>()
  const sets = new Map<string, Set<string>>()

  sinon.stub(redis as any, 'get').callsFake(async (...args: unknown[]) => {
    const key = String(args[0])
    return values.get(key) ?? null
  })
  sinon.stub(redis as any, 'set').callsFake(async (...callArgs: unknown[]) => {
    const key = String(callArgs[0])
    const value = String(callArgs[1])
    const args = callArgs.slice(2).map(String)
    if (args.includes('NX') && values.has(key)) {
      return null
    }

    values.set(key, value)
    return 'OK'
  })
  sinon.stub(redis as any, 'eval').callsFake(async (...callArgs: unknown[]) => {
    const key = String(callArgs[2])
    const args = callArgs.slice(3).map(String)
    const current = values.get(key)
    if (!current) {
      return 0
    }

    const currentRecord = JSON.parse(current) as { lifecycleId?: string }
    const currentLifecycleId = currentRecord.lifecycleId ?? ''
    const expectedLifecycleId = args[0] ?? ''
    if (currentLifecycleId !== expectedLifecycleId) {
      return 0
    }

    if (args.length === 1) {
      values.delete(key)
      return 1
    }

    values.set(key, args[1])
    return 1
  })
  sinon.stub(redis as any, 'sadd').callsFake(async (...callArgs: unknown[]) => {
    const key = String(callArgs[0])
    const members = callArgs.slice(1).map(String)
    const set = sets.get(key) ?? new Set<string>()
    let added = 0
    for (const member of members) {
      if (!set.has(member)) {
        added += 1
      }
      set.add(member)
    }
    sets.set(key, set)
    return added
  })
  sinon.stub(redis as any, 'srem').callsFake(async (...callArgs: unknown[]) => {
    const key = String(callArgs[0])
    const members = callArgs.slice(1).map(String)
    const set = sets.get(key)
    if (!set) {
      return 0
    }

    let removed = 0
    for (const member of members) {
      if (set.delete(member)) {
        removed += 1
      }
    }
    return removed
  })
  sinon.stub(redis as any, 'scard').callsFake(async (...args: unknown[]) => sets.get(String(args[0]))?.size ?? 0)
  sinon.stub(redis as any, 'del').callsFake(async (...args: unknown[]) => {
    const keys = args.map(String)
    let deleted = 0
    for (const key of keys) {
      if (values.delete(key)) {
        deleted += 1
      }
    }
    return deleted
  })

  return {
    readInvocation(invocationId: string) {
      const data = values.get(sandboxRegistryKeys.invocation(invocationId))
      return data ? JSON.parse(data) : null
    },
  }
}

function createRegistryWithManagers(managers: ControlledSandboxManager[]) {
  const registry = new SandboxRegistry()
  sinon.stub(registry as any, 'buildSandboxManager').callsFake(() => {
    const manager = managers.shift()
    if (!manager) {
      throw new Error('No sandbox manager queued')
    }
    return manager
  })

  return registry
}

test.group('SandboxRegistry invocation lifecycle', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('marks an invocation shutdown before physical sandbox teardown completes', async ({ assert }) => {
    const redisHarness = installRedisHarness()
    const shutdownDeferred = createDeferred()
    const oldManager = new ControlledSandboxManager('sandbox-old')
    oldManager.shutdownDeferred = shutdownDeferred
    const registry = createRegistryWithManagers([oldManager])

    await registry.createInvocationSandbox({
      invocationId: 'invocation-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      authToken: 'token-1',
      authTokenId: 'token-id-1',
      correlationId: 'correlation-1',
    })

    await waitFor(() => redisHarness.readInvocation('invocation-1')?.status === 'ready')

    const shutdownPromise = registry.shutdownInvocationSandbox('invocation-1', { deleteAuthToken: false })

    await waitFor(() => oldManager.shutdownStarted)
    assert.equal(redisHarness.readInvocation('invocation-1')?.status, 'shutdown')
    assert.isFalse(await registry.hasInvocation('invocation-1'))
    assert.isFalse(await registry.hasInvocationForWorkspace('workspace-1'))

    shutdownDeferred.resolve()
    await shutdownPromise
  })

  test('creates a fresh lifecycle while an old ready sandbox is still tearing down', async ({ assert }) => {
    const redisHarness = installRedisHarness()
    const shutdownDeferred = createDeferred()
    const oldManager = new ControlledSandboxManager('sandbox-old')
    oldManager.shutdownDeferred = shutdownDeferred
    const newManager = new ControlledSandboxManager('sandbox-new')
    const registry = createRegistryWithManagers([oldManager, newManager])

    await registry.createInvocationSandbox({
      invocationId: 'invocation-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      authToken: 'token-1',
      authTokenId: 'token-id-1',
      correlationId: 'correlation-1',
    })

    await waitFor(() => redisHarness.readInvocation('invocation-1')?.status === 'ready')

    const shutdownPromise = registry.shutdownInvocationSandbox('invocation-1', { deleteAuthToken: false })
    await waitFor(() => redisHarness.readInvocation('invocation-1')?.status === 'shutdown')

    const resumedManager = await registry.createInvocationSandbox({
      invocationId: 'invocation-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      authToken: 'token-2',
      authTokenId: 'token-id-2',
      correlationId: 'correlation-2',
    })

    assert.strictEqual(resumedManager, newManager)
    await waitFor(() => redisHarness.readInvocation('invocation-1')?.sandboxId === 'sandbox-new')

    oldManager.capturedInitOptions?.onSandboxId?.('sandbox-old-late')
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(redisHarness.readInvocation('invocation-1')?.sandboxId, 'sandbox-new')

    shutdownDeferred.resolve()
    await shutdownPromise
    assert.equal(redisHarness.readInvocation('invocation-1')?.sandboxId, 'sandbox-new')
    assert.equal(redisHarness.readInvocation('invocation-1')?.status, 'ready')
  })

  test('ignores late initialization completion from a replaced lifecycle', async ({ assert }) => {
    const redisHarness = installRedisHarness()
    const ensureDeferred = createDeferred()
    const oldManager = new ControlledSandboxManager('sandbox-old')
    oldManager.ensureDeferred = ensureDeferred
    const newManager = new ControlledSandboxManager('sandbox-new')
    const registry = createRegistryWithManagers([oldManager, newManager])

    await registry.createInvocationSandbox({
      invocationId: 'invocation-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      authToken: 'token-1',
      authTokenId: 'token-id-1',
      correlationId: 'correlation-1',
    })

    await waitFor(() => redisHarness.readInvocation('invocation-1')?.status === 'initializing')

    const shutdownPromise = registry.shutdownInvocationSandbox('invocation-1', { deleteAuthToken: false })
    await waitFor(() => redisHarness.readInvocation('invocation-1')?.status === 'shutdown')

    const resumedManager = await registry.createInvocationSandbox({
      invocationId: 'invocation-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      authToken: 'token-2',
      authTokenId: 'token-id-2',
      correlationId: 'correlation-2',
    })

    assert.strictEqual(resumedManager, newManager)
    await waitFor(() => redisHarness.readInvocation('invocation-1')?.sandboxId === 'sandbox-new')

    ensureDeferred.resolve()
    await shutdownPromise
    await waitFor(() => oldManager.shutdownCalls > 0)

    assert.equal(redisHarness.readInvocation('invocation-1')?.sandboxId, 'sandbox-new')
    assert.equal(redisHarness.readInvocation('invocation-1')?.status, 'ready')
  })
})
