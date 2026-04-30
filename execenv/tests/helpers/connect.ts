import WebSocket from 'ws'
import { connectToWorkspace, type ConnectOptions, type WorkspaceConnection } from 'shared'
import { fetchTestSocketToken, type TestEnvironment } from './setup.js'

/**
 * Convenience wrapper that mints a test socket token and passes it to
 * `connectToWorkspace`. Tests that need explicit control over the token can
 * still call `connectToWorkspace` directly.
 */
export async function connectTestWorkspace(
  testEnv: TestEnvironment,
  overrides: Partial<ConnectOptions> = {}
): Promise<WorkspaceConnection> {
  const token = await fetchTestSocketToken(testEnv)
  return connectToWorkspace({
    host: testEnv.yjsServerHost,
    workspaceId: testEnv.workspaceId,
    WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
    socketToken: token,
    ...overrides,
  })
}
