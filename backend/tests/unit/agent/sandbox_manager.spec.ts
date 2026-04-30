import { test } from '@japa/runner'
import sinon from 'sinon'
import { SandboxManager, DockerSandbox, type SandboxConfig } from '#agent/sandbox/index'

const SANDBOX_CONFIG: SandboxConfig = {
  provider: 'docker',
  yjsServerHost: 'localhost:1999',
  yjsServerProtocol: 'ws',
  backendUrl: 'http://localhost:3333',
}

test.group('SandboxManager', (group) => {
  group.each.setup(() => {
    return () => {
      sinon.restore()
    }
  })

  test('initializes only once for concurrent callers', async ({ assert }) => {
    const initializeStub = sinon.stub(DockerSandbox.prototype, 'initialize').callsFake(async function (
      this: DockerSandbox
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      ;(this as unknown as { ready: boolean }).ready = true
    })
    sinon.stub(DockerSandbox.prototype, 'shutdown').resolves()

    const manager = new SandboxManager(SANDBOX_CONFIG)
    manager.setInitOptions({
      workspaceId: 'workspace-1',
      authToken: 'token',
      userId: 'user-1',
      correlationId: 'corr-1',
    })

    await Promise.all([manager.ensureInitialized(), manager.ensureInitialized(), manager.ensureInitialized()])

    assert.equal(initializeStub.callCount, 1)
    assert.isTrue(manager.isInitialized())
  })

  test('caches failed initialization and fails fast on next call', async ({ assert }) => {
    const initializeStub = sinon.stub(DockerSandbox.prototype, 'initialize').rejects(new Error('init failed'))
    sinon.stub(DockerSandbox.prototype, 'shutdown').resolves()

    const manager = new SandboxManager(SANDBOX_CONFIG)
    manager.setInitOptions({
      workspaceId: 'workspace-1',
      authToken: 'token',
      userId: 'user-1',
      correlationId: 'corr-1',
    })

    try {
      await manager.ensureInitialized()
      assert.fail('Expected first initialization to fail')
    } catch (error) {
      assert.equal((error as Error).message, 'init failed')
    }

    try {
      await manager.ensureInitialized()
      assert.fail('Expected second initialization to fail immediately')
    } catch (error) {
      assert.equal((error as Error).message, 'init failed')
    }

    assert.equal(initializeStub.callCount, 1)
  })

  test('fails fast when attaching to a missing Docker container', async ({ assert }) => {
    const inspectStub = sinon.stub(DockerSandbox.prototype as any, 'runDockerCli').resolves({
      stdout: '',
      stderr: 'Error response from daemon: No such container: missing-container',
      exitCode: 1,
    })

    const sandbox = new DockerSandbox(SANDBOX_CONFIG)

    try {
      await sandbox.initialize({
        workspaceId: 'workspace-1',
        authToken: 'token',
        userId: 'user-1',
        correlationId: 'corr-1',
        sandboxId: 'missing-container',
      })
      assert.fail('Expected attach to missing container to fail')
    } catch (error) {
      assert.include((error as Error).message, 'Docker container missing-container is not available')
      assert.include((error as Error).message, 'No such container: missing-container')
    }

    assert.isNull(sandbox.getSandboxId())
    assert.isTrue(inspectStub.calledOnce)
  })
})
