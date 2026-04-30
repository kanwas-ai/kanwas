import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import pino from 'pino'

import { SyncManager } from '../../src/sync-manager.js'

const testLogger = pino({ level: 'silent' })

describe('SyncManager section intents', () => {
  let workspacePath: string

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-manager-geometry-'))
  })

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true })
  })

  it('loads section intent and deletes it after successful create sync', async () => {
    const syncManager = new SyncManager({
      workspaceId: 'workspace-geometry-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    const syncChange = vi
      .fn()
      .mockResolvedValue({ success: true, action: 'created_node', nodeId: 'n1', canvasId: 'c1' })

    ;(syncManager as any).syncer = { syncChange }
    ;(syncManager as any).metadataManager = { handleSyncResult: async () => {} }

    const absolutePath = path.join(workspacePath, 'docs', 'hello.md')
    const placementPath = path.join('/tmp/kanwas-placement', 'docs', 'hello.md.json')

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, 'Hello world', 'utf-8')
    await fs.mkdir(path.dirname(placementPath), { recursive: true })
    await fs.writeFile(
      placementPath,
      JSON.stringify({ section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 } }),
      'utf-8'
    )

    const result = await syncManager.handleFileChange('create', absolutePath)

    expect(result?.success).toBe(true)
    expect(syncChange).toHaveBeenCalledWith({
      type: 'create',
      path: 'docs/hello.md',
      content: 'Hello world',
      section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
    })
    await expect(fs.access(placementPath)).rejects.toThrow()
  })

  it('passes join section intent through update sync', async () => {
    const syncManager = new SyncManager({
      workspaceId: 'workspace-geometry-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    const syncChange = vi
      .fn()
      .mockResolvedValue({ success: true, action: 'updated_content', nodeId: 'n1', canvasId: 'c1' })

    ;(syncManager as any).syncer = { syncChange }
    ;(syncManager as any).metadataManager = { handleSyncResult: async () => {} }

    const absolutePath = path.join(workspacePath, 'docs', 'plain.md')
    const placementPath = path.join('/tmp/kanwas-placement', 'docs', 'plain.md.json')
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, 'Plain file', 'utf-8')
    await fs.mkdir(path.dirname(placementPath), { recursive: true })
    await fs.writeFile(placementPath, JSON.stringify({ section: { mode: 'join', title: 'Overview' } }), 'utf-8')

    const result = await syncManager.handleFileChange('update', absolutePath)

    expect(result?.success).toBe(true)
    expect(syncChange).toHaveBeenCalledWith({
      type: 'update',
      path: 'docs/plain.md',
      content: 'Plain file',
      section: { mode: 'join', title: 'Overview' },
    })
    await expect(fs.access(placementPath)).rejects.toThrow()
  })

  it('creates without section when no intent file exists', async () => {
    const syncManager = new SyncManager({
      workspaceId: 'workspace-geometry-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    const syncChange = vi
      .fn()
      .mockResolvedValue({ success: true, action: 'updated_content', nodeId: 'n1', canvasId: 'c1' })

    ;(syncManager as any).syncer = { syncChange }
    ;(syncManager as any).metadataManager = { handleSyncResult: async () => {} }

    const absolutePath = path.join(workspacePath, 'docs', 'plain.md')
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, 'Plain file', 'utf-8')

    const result = await syncManager.handleFileChange('create', absolutePath)

    expect(result?.success).toBe(true)
    expect(syncChange).toHaveBeenCalledWith({
      type: 'create',
      path: 'docs/plain.md',
      content: 'Plain file',
      section: undefined,
    })
  })

  it('passes grid section create intent through create sync', async () => {
    const syncManager = new SyncManager({
      workspaceId: 'workspace-geometry-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    const syncChange = vi
      .fn()
      .mockResolvedValue({ success: true, action: 'created_node', nodeId: 'n1', canvasId: 'c1' })

    ;(syncManager as any).syncer = { syncChange }
    ;(syncManager as any).metadataManager = { handleSyncResult: async () => {} }

    const absolutePath = path.join(workspacePath, 'docs', 'group-heading.text.yaml')
    const placementPath = path.join('/tmp/kanwas-placement', 'docs', 'group-heading.text.yaml.json')

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, 'content: Group heading\n', 'utf-8')
    await fs.mkdir(path.dirname(placementPath), { recursive: true })
    await fs.writeFile(
      placementPath,
      JSON.stringify({
        section: {
          mode: 'create',
          title: 'Grouped',
          layout: 'grid',
          x: 200,
          y: 300,
          columns: 3,
        },
      }),
      'utf-8'
    )

    const result = await syncManager.handleFileChange('create', absolutePath)

    expect(result?.success).toBe(true)
    expect(syncChange).toHaveBeenCalledWith({
      type: 'create',
      path: 'docs/group-heading.text.yaml',
      content: 'content: Group heading\n',
      section: { mode: 'create', title: 'Grouped', layout: 'grid', x: 200, y: 300, columns: 3 },
    })
    await expect(fs.access(placementPath)).rejects.toThrow()
  })

  it('passes relative section create intent through create sync', async () => {
    const syncManager = new SyncManager({
      workspaceId: 'workspace-geometry-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    const syncChange = vi
      .fn()
      .mockResolvedValue({ success: true, action: 'created_node', nodeId: 'n1', canvasId: 'c1' })

    ;(syncManager as any).syncer = { syncChange }
    ;(syncManager as any).metadataManager = { handleSyncResult: async () => {} }

    const absolutePath = path.join(workspacePath, 'docs', 'details.md')
    const placementPath = path.join('/tmp/kanwas-placement', 'docs', 'details.md.json')

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, 'Details', 'utf-8')
    await fs.mkdir(path.dirname(placementPath), { recursive: true })
    await fs.writeFile(
      placementPath,
      JSON.stringify({
        section: {
          mode: 'create',
          title: 'Details',
          layout: 'horizontal',
          placement: { mode: 'after', anchorSectionTitle: 'Overview', gap: 96 },
        },
      }),
      'utf-8'
    )

    const result = await syncManager.handleFileChange('create', absolutePath)

    expect(result?.success).toBe(true)
    expect(syncChange).toHaveBeenCalledWith({
      type: 'create',
      path: 'docs/details.md',
      content: 'Details',
      section: {
        mode: 'create',
        title: 'Details',
        layout: 'horizontal',
        placement: { mode: 'after', anchorSectionTitle: 'Overview', gap: 96 },
      },
    })
    await expect(fs.access(placementPath)).rejects.toThrow()
  })

  it('forwards rename events to identity-preserving sync', async () => {
    const syncManager = new SyncManager({
      workspaceId: 'workspace-geometry-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    const syncRename = vi
      .fn()
      .mockResolvedValue({ success: true, action: 'renamed_node', nodeId: 'n1', canvasId: 'c1' })
    const handleSyncResult = vi.fn().mockResolvedValue(undefined)

    ;(syncManager as any).syncer = { syncRename }
    ;(syncManager as any).metadataManager = { handleSyncResult }

    const oldAbsolutePath = path.join(workspacePath, 'docs', 'before.md')
    const newAbsolutePath = path.join(workspacePath, 'docs', 'after.md')

    const result = await syncManager.handleRename(oldAbsolutePath, newAbsolutePath, false)

    expect(result?.success).toBe(true)
    expect(syncRename).toHaveBeenCalledWith('docs/before.md', 'docs/after.md', false)
    expect(handleSyncResult).toHaveBeenCalledWith(newAbsolutePath, {
      success: true,
      action: 'renamed_node',
      nodeId: 'n1',
      canvasId: 'c1',
    })
  })
})
