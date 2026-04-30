import { test } from '@japa/runner'
import sinon from 'sinon'
import { Sandbox } from 'e2b'
import { E2BSandbox, type SandboxConfig } from '#agent/sandbox/index'

const SANDBOX_CONFIG: SandboxConfig = {
  provider: 'e2b',
  yjsServerHost: 'localhost:1999',
  yjsServerProtocol: 'wss',
  backendUrl: 'http://localhost:3333',
}

test.group('E2BSandbox pause/resume', (group) => {
  group.each.setup(() => {
    return () => {
      sinon.restore()
    }
  })

  test('resumes with an explicit timeout when reconnecting to the same sandbox', async ({ assert }) => {
    const sandbox = new E2BSandbox(SANDBOX_CONFIG)
    const commandsRun = sinon.stub().resolves({ stdout: '', stderr: '', exitCode: 0 })
    const connectedSandbox = {
      sandboxId: 'sandbox-123',
      commands: {
        run: commandsRun,
      },
    }

    const connectStub = sinon.stub(Sandbox, 'connect').resolves(connectedSandbox as any)

    ;(sandbox as any).sandbox = { sandboxId: 'sandbox-123' }
    ;(sandbox as any).paused = true
    ;(sandbox as any).ready = true

    await sandbox.resume()

    assert.isTrue(connectStub.calledOnceWithExactly('sandbox-123', { timeoutMs: 30 * 60 * 1000 }))
    assert.isTrue(commandsRun.calledOnce)
    assert.isTrue(commandsRun.calledWithMatch('test -f /workspace/.ready', sinon.match.object))
    assert.isFalse(sandbox.isPaused())
    assert.isTrue(sandbox.isReady())
    assert.equal(sandbox.getSandboxId(), 'sandbox-123')
  })
})
