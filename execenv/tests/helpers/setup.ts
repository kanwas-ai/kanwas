/**
 * Test environment setup helpers for execenv integration tests.
 *
 * These helpers handle backend registration, workspace creation, and health checks.
 */

import * as Y from 'yjs'
import { createWorkspaceSnapshotBundle } from 'shared/server'
import type { WorkspaceDocument } from 'shared'
import { createYjsProxy } from 'valtio-y'

export interface TestEnvironment {
  authToken: string
  workspaceId: string
  userEmail: string
  backendUrl: string
  yjsServerHost: string
}

export interface SetupOptions {
  seed?: 'default' | 'empty'
}

export interface WaitForHealthOptions {
  timeoutMs?: number
  intervalMs?: number
}

const DEFAULT_HEALTH_TIMEOUT_MS = 15000
const DEFAULT_HEALTH_INTERVAL_MS = 250

/**
 * Set up test environment by registering a user and creating a workspace.
 * Returns auth tokens and IDs needed for integration tests.
 */
export async function setupTestEnvironment(options: SetupOptions = {}): Promise<TestEnvironment> {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3333'
  const yjsServerHost = process.env.YJS_SERVER_HOST || 'localhost:1999'

  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).substring(2, 8)
  const testEmail = `execenv-test-${timestamp}-${randomSuffix}@example.com`
  const testPassword = 'testpass123'
  const testName = 'Execenv Integration User'

  console.error('Setting up integration test data...')
  console.error(`Backend URL: ${backendUrl}`)
  console.error(`Test email: ${testEmail}`)

  // Register user
  const registerResponse = await fetch(`${backendUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: testName,
      email: testEmail,
      password: testPassword,
    }),
  })

  if (!registerResponse.ok) {
    const error = await registerResponse.text()
    throw new Error(`Failed to register user: ${registerResponse.status} - ${error}`)
  }

  const registerData = (await registerResponse.json()) as { type: string; value: string }
  if (!registerData.value) {
    throw new Error(`Registration response missing token value: ${JSON.stringify(registerData)}`)
  }

  const token = registerData.value

  // Create workspace
  const workspaceResponse = await fetch(`${backendUrl}/workspaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Execenv Integration Test' }),
  })

  if (!workspaceResponse.ok) {
    const error = await workspaceResponse.text()
    throw new Error(`Failed to create workspace: ${workspaceResponse.status} - ${error}`)
  }

  const workspaceData = (await workspaceResponse.json()) as { id: string }
  if (!workspaceData.id) {
    throw new Error(`Workspace response missing id: ${JSON.stringify(workspaceData)}`)
  }

  if (options.seed !== 'default') {
    await replaceWorkspaceWithEmptySnapshot(workspaceData.id, yjsServerHost)
  }

  console.error(`Created workspace: ${workspaceData.id}`)

  return {
    authToken: token,
    workspaceId: workspaceData.id,
    userEmail: testEmail,
    backendUrl,
    yjsServerHost,
  }
}

/**
 * Check if backend is healthy and available.
 */
export async function checkBackendHealth(backendUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${backendUrl}/health`)
    return response.ok
  } catch {
    return false
  }
}

export async function checkYjsServerHealth(yjsServerHost: string): Promise<boolean> {
  const baseUrl = normalizeYjsServerBaseUrl(yjsServerHost)

  try {
    const response = await fetch(`${baseUrl}/health`)
    return response.ok
  } catch {
    return false
  }
}

export async function waitForBackendHealth(backendUrl: string, options: WaitForHealthOptions = {}): Promise<void> {
  await waitForHealthCheck(
    () => checkBackendHealth(backendUrl),
    `Backend not available at ${backendUrl}. ` +
      `Please run: docker-compose up -d postgres redis, then start backend and yjs-server with pnpm dev`,
    options
  )
}

export async function waitForYjsServerHealth(yjsServerHost: string, options: WaitForHealthOptions = {}): Promise<void> {
  await waitForHealthCheck(
    () => checkYjsServerHealth(yjsServerHost),
    `Yjs server not available at ${yjsServerHost}. ` +
      `Please run: docker-compose up -d postgres redis, then start backend and yjs-server with pnpm dev`,
    options
  )
}

function normalizeYjsServerBaseUrl(yjsServerHost: string): string {
  return /^https?:\/\//.test(yjsServerHost)
    ? yjsServerHost
    : /^wss?:\/\//.test(yjsServerHost)
      ? yjsServerHost.replace(/^ws/, 'http')
      : `http://${yjsServerHost}`
}

async function waitForHealthCheck(
  check: () => Promise<boolean>,
  timeoutMessage: string,
  options: WaitForHealthOptions
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS
  const intervalMs = options.intervalMs ?? DEFAULT_HEALTH_INTERVAL_MS
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await check()) {
      return
    }

    await delay(intervalMs)
  }

  throw new Error(`${timeoutMessage} (timed out after ${timeoutMs}ms)`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function replaceWorkspaceWithEmptySnapshot(workspaceId: string, yjsServerHost: string): Promise<void> {
  const doc = new Y.Doc()
  const { bootstrap, dispose } = createYjsProxy<WorkspaceDocument>(doc, {
    getRoot: (currentDoc) => currentDoc.getMap('state'),
  })
  bootstrap({
    root: {
      id: 'root',
      kind: 'canvas',
      name: '',
      xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      items: [],
      edges: [],
    },
  })

  const replaceUrl = new URL(`${normalizeYjsServerBaseUrl(yjsServerHost)}/documents/${workspaceId}/replace`)
  replaceUrl.searchParams.set('notifyBackend', 'false')
  replaceUrl.searchParams.set('reason', 'execenv-test-setup')

  const response = await fetch(replaceUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.BACKEND_API_SECRET || 'secret23'}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createWorkspaceSnapshotBundle(doc)),
  })

  dispose()
  doc.destroy()

  if (!response.ok) {
    const error = await response.text()
    throw new Error(
      `Failed to seed execenv integration workspace ${workspaceId}: ${response.status} ${error}. ` +
        'If backend or yjs-server were started before the latest note-subdoc changes, restart them and try again.'
    )
  }
}

export async function resetWorkspaceToEmpty(workspaceId: string, yjsServerHost: string): Promise<void> {
  await replaceWorkspaceWithEmptySnapshot(workspaceId, yjsServerHost)
}

/**
 * Mint a Yjs socket token for the test user. Tests that directly open a
 * workspace socket (outside the SyncManager) must pass the result via
 * `connectToWorkspace({ socketToken })`.
 */
export async function fetchTestSocketToken(testEnv: TestEnvironment): Promise<string> {
  const response = await fetch(`${testEnv.backendUrl}/workspaces/${testEnv.workspaceId}/yjs-socket-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${testEnv.authToken}` },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed to mint test Yjs socket token: ${response.status} ${body}`)
  }

  const data = (await response.json()) as { token?: string }
  if (!data.token) {
    throw new Error('Test Yjs socket token response missing "token" field')
  }
  return data.token
}
