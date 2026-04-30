import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { findNoteBlockNoteFragment, getNoteDoc, type CanvasItem, type NodeItem, type WorkspaceConnection } from 'shared'
import { connectTestWorkspace } from '../helpers/connect.js'
import { ContentConverter } from 'shared/server'

import { SyncManager } from '../../src/sync-manager.js'
import {
  setupTestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
  type TestEnvironment,
  cleanupConnections,
  delay,
  testLogger,
} from '../helpers/index.js'

const KANWAS_SYSTEM_NODE_KIND = 'kanwas_md' as const
const CANONICAL_KANWAS_FILENAME = 'instructions.md'

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isKanwasNode(item: NodeItem): boolean {
  if (item.xynode.type !== 'blockNote') {
    return false
  }

  if (!isObjectRecord(item.xynode.data)) {
    return false
  }

  return item.xynode.data.systemNodeKind === KANWAS_SYSTEM_NODE_KIND
}

function findKanwasNodeId(canvas: CanvasItem | undefined): string | null {
  if (!canvas) {
    return null
  }

  for (const item of canvas.items) {
    if (item.kind === 'node' && isKanwasNode(item)) {
      return item.id
    }

    if (item.kind === 'canvas') {
      const nestedNodeId = findKanwasNodeId(item)
      if (nestedNodeId) {
        return nestedNodeId
      }
    }
  }

  return null
}

describe('Kanwas file protection in execenv', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
  const activeSyncManagers: SyncManager[] = []
  const activeConnections: WorkspaceConnection[] = []

  beforeAll(async () => {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3333'
    const yjsServerHost = process.env.YJS_SERVER_HOST || 'localhost:1999'

    await waitForBackendHealth(backendUrl)
    await waitForYjsServerHealth(yjsServerHost)
  }, 20000)

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-kanwas-protection-'))
    testEnv = await setupTestEnvironment({ seed: 'default' })
  })

  afterEach(async () => {
    for (const manager of activeSyncManagers) {
      manager.shutdown()
    }
    activeSyncManagers.length = 0

    cleanupConnections(activeConnections)

    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  async function connectReaderConnection(): Promise<WorkspaceConnection> {
    const connection = await connectTestWorkspace(testEnv, { logger: testLogger })

    activeConnections.push(connection)
    return connection
  }

  async function createSyncManager(): Promise<SyncManager> {
    const syncManager = new SyncManager({
      workspaceId: testEnv.workspaceId,
      yjsServerHost: testEnv.yjsServerHost,
      workspacePath,
      backendUrl: testEnv.backendUrl,
      authToken: testEnv.authToken,
      userId: 'test-user',
      logger: testLogger,
    })
    activeSyncManagers.push(syncManager)
    await syncManager.initialize()
    return syncManager
  }

  async function waitForKanwasNodeId(connection: WorkspaceConnection, timeoutMs = 4000): Promise<string> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const nodeId = findKanwasNodeId(connection.proxy.root)
      if (nodeId) {
        return nodeId
      }

      await delay(100)
    }

    throw new Error('Timed out waiting for canonical Kanwas node')
  }

  function getKanwasFragment(connection: WorkspaceConnection, noteId: string) {
    const noteDoc = getNoteDoc(connection.yDoc, noteId)
    return noteDoc ? findNoteBlockNoteFragment(noteDoc) : undefined
  }

  it('allows editing Kanwas.md', async () => {
    const syncManager = await createSyncManager()

    const readerConnection = await connectReaderConnection()
    const kanwasPath = path.join(workspacePath, CANONICAL_KANWAS_FILENAME)
    const updatedMarkdown = '# Editable Kanwas\n\nAgent should follow this rule.'

    await fs.writeFile(kanwasPath, updatedMarkdown, 'utf-8')
    const result = await syncManager.handleFileChange('update', kanwasPath)

    expect(result?.success).toBe(true)
    expect(result?.action).toBe('updated_content')

    await delay(800)

    const kanwasNodeId = await waitForKanwasNodeId(readerConnection)
    const fragment = getKanwasFragment(readerConnection, kanwasNodeId)
    expect(fragment).toBeDefined()
    expect(fragment!.toString()).toContain('Agent should follow this rule')
  })

  it('blocks deleting Kanwas.md and restores the file', async () => {
    const syncManager = await createSyncManager()

    const readerConnection = await connectReaderConnection()
    const kanwasPath = path.join(workspacePath, CANONICAL_KANWAS_FILENAME)
    const canonicalNodeIdBefore = await waitForKanwasNodeId(readerConnection)
    const protectedMarkdown = '# Protected Kanwas\n\nDo not lose me after delete.'

    await fs.writeFile(kanwasPath, protectedMarkdown, 'utf-8')
    const updateResult = await syncManager.handleFileChange('update', kanwasPath)

    expect(updateResult?.success).toBe(true)
    expect(updateResult?.action).toBe('updated_content')

    await delay(800)

    await fs.unlink(kanwasPath)
    const deleteResult = await syncManager.handleFileChange('delete', kanwasPath)

    expect(deleteResult?.success).toBe(true)
    expect(deleteResult?.action).toBe('no_op')
    expect(deleteResult?.nodeId).toBe(canonicalNodeIdBefore)

    await delay(400)

    const restoredContent = await fs.readFile(kanwasPath, 'utf-8')
    expect(restoredContent).toContain('Do not lose me after delete.')

    const canonicalNodeIdAfter = await waitForKanwasNodeId(readerConnection)
    expect(canonicalNodeIdAfter).toBe(canonicalNodeIdBefore)

    const fragment = getKanwasFragment(readerConnection, canonicalNodeIdBefore)
    expect(fragment).toBeDefined()
    expect(fragment!.toString()).toContain('Do not lose me after delete.')
  })

  it('restores canonical Kanwas.md when moved file is processed as delete then create', async () => {
    const syncManager = await createSyncManager()
    const readerConnection = await connectReaderConnection()
    const canonicalNodeIdBefore = await waitForKanwasNodeId(readerConnection)

    const kanwasPath = path.join(workspacePath, CANONICAL_KANWAS_FILENAME)
    const movedPath = path.join(workspacePath, 'kanwas-moved.md')
    const updatedMarkdown = '# Move Protected\n\nCanonical content survives source delete.'

    await fs.writeFile(kanwasPath, updatedMarkdown, 'utf-8')
    const updateResult = await syncManager.handleFileChange('update', kanwasPath)
    expect(updateResult?.success).toBe(true)
    expect(updateResult?.action).toBe('updated_content')

    await delay(800)

    await fs.rename(kanwasPath, movedPath)

    const deleteResult = await syncManager.handleFileChange('delete', kanwasPath)
    const createResult = await syncManager.handleFileChange('create', movedPath)

    expect(deleteResult?.success).toBe(true)
    expect(deleteResult?.action).toBe('no_op')
    expect(deleteResult?.nodeId).toBe(canonicalNodeIdBefore)
    expect(createResult?.success).toBe(true)

    await delay(400)

    const restoredContent = await fs.readFile(kanwasPath, 'utf-8')
    const movedContent = await fs.readFile(movedPath, 'utf-8')
    expect(restoredContent).toContain('Canonical content survives source delete.')
    expect(movedContent).toContain('Canonical content survives source delete.')

    const canonicalNodeIdAfter = await waitForKanwasNodeId(readerConnection)
    expect(canonicalNodeIdAfter).toBe(canonicalNodeIdBefore)
  })

  it('restores canonical Kanwas.md when moved file is processed as create then delete', async () => {
    const syncManager = await createSyncManager()
    const readerConnection = await connectReaderConnection()
    const canonicalNodeIdBefore = await waitForKanwasNodeId(readerConnection)

    const kanwasPath = path.join(workspacePath, CANONICAL_KANWAS_FILENAME)
    const movedPath = path.join(workspacePath, 'kanwas-moved-create-first.md')
    const updatedMarkdown = '# Move Order\n\nCreate-first ordering still restores source.'

    await fs.writeFile(kanwasPath, updatedMarkdown, 'utf-8')
    const updateResult = await syncManager.handleFileChange('update', kanwasPath)
    expect(updateResult?.success).toBe(true)
    expect(updateResult?.action).toBe('updated_content')

    await delay(800)

    await fs.rename(kanwasPath, movedPath)

    const createResult = await syncManager.handleFileChange('create', movedPath)
    const deleteResult = await syncManager.handleFileChange('delete', kanwasPath)

    expect(createResult?.success).toBe(true)
    expect(deleteResult?.success).toBe(true)
    expect(deleteResult?.action).toBe('no_op')
    expect(deleteResult?.nodeId).toBe(canonicalNodeIdBefore)

    await delay(400)

    const restoredContent = await fs.readFile(kanwasPath, 'utf-8')
    expect(restoredContent).toContain('Create-first ordering still restores source.')

    const canonicalNodeIdAfter = await waitForKanwasNodeId(readerConnection)
    expect(canonicalNodeIdAfter).toBe(canonicalNodeIdBefore)
  })

  it('merges non-overlapping concurrent edits and applies filesystem changes', async () => {
    const syncManager = await createSyncManager()
    const readerConnection = await connectReaderConnection()
    const converter = new ContentConverter(testLogger)

    const kanwasNodeId = await waitForKanwasNodeId(readerConnection)
    const kanwasPath = path.join(workspacePath, CANONICAL_KANWAS_FILENAME)

    const baseMarkdown = '# Kanwas\n\nParagraph A base.\n\nParagraph B base.'
    await fs.writeFile(kanwasPath, baseMarkdown, 'utf-8')
    const baseSyncResult = await syncManager.handleFileChange('update', kanwasPath)
    expect(baseSyncResult?.success).toBe(true)
    expect(baseSyncResult?.action).toBe('updated_content')

    await delay(800)

    // Simulate user edit that updated yDoc after the file-based snapshot.
    const fragment = getKanwasFragment(readerConnection, kanwasNodeId)
    expect(fragment).toBeDefined()
    await converter.updateFragmentFromMarkdown(
      fragment as any,
      '# Kanwas\n\nParagraph A base.\n\nParagraph B user edit.',
      {
        nodeId: kanwasNodeId,
        source: 'kanwas-file-protection.non-overlap',
      }
    )

    await delay(800)

    // Stale filesystem update changes a different paragraph; merge should keep both edits.
    const agentMarkdown = '# Kanwas\n\nParagraph A agent edit.\n\nParagraph B base.'
    await fs.writeFile(kanwasPath, agentMarkdown, 'utf-8')
    const mergeResult = await syncManager.handleFileChange('update', kanwasPath)

    expect(mergeResult?.success).toBe(true)
    expect(['updated_content', 'no_op']).toContain(mergeResult?.action)

    await delay(800)

    const mergedFragment = getKanwasFragment(readerConnection, kanwasNodeId)
    expect(mergedFragment).toBeDefined()
    const mergedMarkdown = await converter.fragmentToMarkdown(mergedFragment as any)
    expect(mergedMarkdown).toContain('Paragraph A agent edit.')
    expect(mergedMarkdown).toContain('Paragraph B user edit.')

    const mergedFileContent = await fs.readFile(kanwasPath, 'utf-8')
    expect(mergedFileContent).toContain('Paragraph A agent edit.')
    expect(mergedFileContent).toContain('Paragraph B user edit.')

    // First watcher echo is suppressed because sync manager wrote merged content back to disk.
    const suppressedWritebackEcho = await syncManager.handleFileChange('update', kanwasPath)
    expect(suppressedWritebackEcho?.success).toBe(true)
    expect(suppressedWritebackEcho?.action).toBe('no_op')
    expect(suppressedWritebackEcho?.nodeId).toBe(kanwasNodeId)

    // Suppression is single-use, but unchanged canonical markdown should still no-op.
    const unsuppressedRepeat = await syncManager.handleFileChange('update', kanwasPath)
    expect(unsuppressedRepeat?.success).toBe(true)
    expect(unsuppressedRepeat?.action).toBe('no_op')
    expect(unsuppressedRepeat?.nodeId).toBe(kanwasNodeId)

    // Real external follow-up edit must apply normally.
    const followUpMarkdown = '# Kanwas\n\nParagraph A agent edit.\n\nParagraph B user edit.\n\nParagraph C follow-up.'
    await fs.writeFile(kanwasPath, followUpMarkdown, 'utf-8')
    const followUpResult = await syncManager.handleFileChange('update', kanwasPath)

    expect(followUpResult?.success).toBe(true)
    expect(followUpResult?.action).toBe('updated_content')
    expect(followUpResult?.nodeId).toBe(kanwasNodeId)

    await delay(500)

    const followUpFragment = getKanwasFragment(readerConnection, kanwasNodeId)
    expect(followUpFragment).toBeDefined()
    const followUpContent = await converter.fragmentToMarkdown(followUpFragment as any)
    expect(followUpContent).toContain('Paragraph C follow-up.')

    const followUpFileContent = await fs.readFile(kanwasPath, 'utf-8')
    expect(followUpFileContent).toContain('Paragraph C follow-up.')
  })

  it('restores canonical markdown when stale incoming equals shadow base', async () => {
    const syncManager = await createSyncManager()
    const readerConnection = await connectReaderConnection()
    const converter = new ContentConverter(testLogger)

    const kanwasNodeId = await waitForKanwasNodeId(readerConnection)
    const kanwasPath = path.join(workspacePath, CANONICAL_KANWAS_FILENAME)

    const baseMarkdown = '# Kanwas\n\nShared paragraph base.'
    await fs.writeFile(kanwasPath, baseMarkdown, 'utf-8')
    const baseSyncResult = await syncManager.handleFileChange('update', kanwasPath)
    expect(baseSyncResult?.success).toBe(true)
    expect(baseSyncResult?.action).toBe('updated_content')

    await delay(800)

    const fragment = getKanwasFragment(readerConnection, kanwasNodeId)
    expect(fragment).toBeDefined()
    await converter.updateFragmentFromMarkdown(fragment as any, '# Kanwas\n\nShared paragraph user edit.', {
      nodeId: kanwasNodeId,
      source: 'kanwas-file-protection.merge-noop',
    })

    await delay(800)

    // Incoming file content equals stale shadow base; merge should preserve current yDoc content.
    await fs.writeFile(kanwasPath, baseMarkdown, 'utf-8')
    const mergeNoopResult = await syncManager.handleFileChange('update', kanwasPath)

    expect(mergeNoopResult?.success).toBe(true)
    expect(mergeNoopResult?.action).toBe('no_op')
    expect(mergeNoopResult?.nodeId).toBe(kanwasNodeId)

    await delay(500)

    const finalFragment = getKanwasFragment(readerConnection, kanwasNodeId)
    expect(finalFragment).toBeDefined()
    const finalMarkdown = await converter.fragmentToMarkdown(finalFragment as any)
    expect(finalMarkdown).toContain('Shared paragraph user edit.')
    expect(finalMarkdown).not.toContain('Shared paragraph base.')

    const restoredFileContent = await fs.readFile(kanwasPath, 'utf-8')
    expect(restoredFileContent).toContain('Shared paragraph user edit.')
    expect(restoredFileContent).not.toContain('Shared paragraph base.')

    // Restore write suppression should be consumed once.
    const suppressedRestoreEcho = await syncManager.handleFileChange('update', kanwasPath)
    expect(suppressedRestoreEcho?.success).toBe(true)
    expect(suppressedRestoreEcho?.action).toBe('no_op')
    expect(suppressedRestoreEcho?.nodeId).toBe(kanwasNodeId)

    const unsuppressedRepeat = await syncManager.handleFileChange('update', kanwasPath)
    expect(unsuppressedRepeat?.success).toBe(true)
    expect(unsuppressedRepeat?.action).toBe('no_op')
    expect(unsuppressedRepeat?.nodeId).toBe(kanwasNodeId)
  })

  it('preserves yDoc and restores filesystem when concurrent edits overlap', async () => {
    const syncManager = await createSyncManager()
    const readerConnection = await connectReaderConnection()
    const converter = new ContentConverter(testLogger)

    const kanwasNodeId = await waitForKanwasNodeId(readerConnection)
    const kanwasPath = path.join(workspacePath, CANONICAL_KANWAS_FILENAME)

    const baseMarkdown = '# Kanwas\n\nShared paragraph base.'
    await fs.writeFile(kanwasPath, baseMarkdown, 'utf-8')
    const baseSyncResult = await syncManager.handleFileChange('update', kanwasPath)
    expect(baseSyncResult?.success).toBe(true)
    expect(baseSyncResult?.action).toBe('updated_content')

    await delay(800)

    const fragment = getKanwasFragment(readerConnection, kanwasNodeId)
    expect(fragment).toBeDefined()
    await converter.updateFragmentFromMarkdown(fragment as any, '# Kanwas\n\nShared paragraph user edit.', {
      nodeId: kanwasNodeId,
      source: 'kanwas-file-protection.overlap',
    })

    await delay(800)

    const staleAgentMarkdown = '# Kanwas\n\nShared paragraph agent edit.'
    await fs.writeFile(kanwasPath, staleAgentMarkdown, 'utf-8')
    const conflictResult = await syncManager.handleFileChange('update', kanwasPath)

    expect(conflictResult?.success).toBe(true)
    expect(conflictResult?.action).toBe('no_op')
    expect(conflictResult?.nodeId).toBe(kanwasNodeId)

    await delay(500)

    const finalFragment = getKanwasFragment(readerConnection, kanwasNodeId)
    expect(finalFragment).toBeDefined()
    const finalMarkdown = await converter.fragmentToMarkdown(finalFragment as any)
    expect(finalMarkdown).toContain('Shared paragraph user edit.')
    expect(finalMarkdown).not.toContain('Shared paragraph agent edit.')

    const restoredFileContent = await fs.readFile(kanwasPath, 'utf-8')
    expect(restoredFileContent).toContain('Shared paragraph user edit.')
    expect(restoredFileContent).not.toContain('Shared paragraph agent edit.')

    // Simulate watcher echo event for the internal restore write.
    const suppressedResult = await syncManager.handleFileChange('update', kanwasPath)
    expect(suppressedResult?.success).toBe(true)
    expect(suppressedResult?.action).toBe('no_op')
    expect(suppressedResult?.nodeId).toBe(kanwasNodeId)
  })

  it('returns an error when Kanwas.md restore fails after delete is blocked', async () => {
    const syncManager = await createSyncManager()
    const readerConnection = await connectReaderConnection()
    const canonicalNodeIdBefore = await waitForKanwasNodeId(readerConnection)

    const kanwasPath = path.join(workspacePath, CANONICAL_KANWAS_FILENAME)
    const movedPath = path.join(workspacePath, 'kanwas-moved-restore-failure.md')

    await fs.rename(kanwasPath, movedPath)
    await fs.mkdir(kanwasPath)

    const deleteResult = await syncManager.handleFileChange('delete', kanwasPath)

    expect(deleteResult?.success).toBe(false)
    expect(deleteResult?.action).toBe('error')
    expect(deleteResult?.nodeId).toBe(canonicalNodeIdBefore)
    expect(deleteResult?.error).toContain('Failed to restore protected Kanwas file')

    const canonicalNodeIdAfter = await waitForKanwasNodeId(readerConnection)
    expect(canonicalNodeIdAfter).toBe(canonicalNodeIdBefore)

    const stat = await fs.stat(kanwasPath)
    expect(stat.isDirectory()).toBe(true)
  })
})
