import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pino from 'pino'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { type CanvasItem, type PathMapper, type WorkspaceConnection } from 'shared'
import { SyncManager } from '../../src/sync-manager.js'
import { readMetadataYaml, writeMetadataYaml } from '../../src/filesystem.js'

const testLogger = pino({ level: 'silent' })

function createRootCanvas(): CanvasItem {
  return {
    id: 'root',
    kind: 'canvas',
    name: '',
    xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
    items: [
      {
        id: 'canvas-1',
        kind: 'canvas',
        name: 'docs',
        xynode: { id: 'canvas-1', type: 'canvas', position: { x: 100, y: 100 }, data: {} },
        edges: [],
        items: [
          {
            id: 'node-1',
            kind: 'node',
            name: 'hello',
            xynode: {
              id: 'node-1',
              type: 'blockNote',
              position: { x: 120, y: 332 },
              measured: { width: 320, height: 180 },
              data: {},
            },
          },
          {
            id: 'node-2',
            kind: 'node',
            name: 'picture',
            xynode: {
              id: 'node-2',
              type: 'image',
              position: { x: 460, y: 332 },
              measured: { width: 240, height: 180 },
              data: {},
            },
          },
        ],
        sections: [],
      },
    ],
    edges: [],
  }
}

function createSyncManager() {
  const syncManager = new SyncManager({
    workspaceId: 'workspace-live-state-unit',
    yjsServerHost: 'localhost:1999',
    workspacePath: '/tmp/workspace-live-state-unit',
    backendUrl: 'http://localhost:3333',
    authToken: 'test-token',
    userId: 'test-user',
    logger: testLogger,
  })

  const root = createRootCanvas()
  const connection = {
    proxy: { root },
  } as WorkspaceConnection
  const pathMapper = {
    resolveNewFile: vi.fn().mockReturnValue({ canvasId: 'canvas-1' }),
    getMapping: vi.fn((relativePath: string) => {
      if (relativePath === 'docs/hello.md') {
        return { path: relativePath, nodeId: 'node-1', canvasId: 'canvas-1', originalName: 'hello', type: 'node' }
      }

      if (relativePath === 'docs/picture.png') {
        return { path: relativePath, nodeId: 'node-2', canvasId: 'canvas-1', originalName: 'picture', type: 'node' }
      }

      return undefined
    }),
  } as unknown as PathMapper

  ;(syncManager as unknown as { connection: WorkspaceConnection | null }).connection = connection
  ;(syncManager as unknown as { pathMapper: PathMapper | null }).pathMapper = pathMapper

  return { syncManager, root, pathMapper }
}

async function createSectionApplyHarness() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanwas-section-apply-'))
  const canvasDir = path.join(tempDir, 'docs')
  await fs.mkdir(canvasDir, { recursive: true })
  await writeMetadataYaml(canvasDir, {
    id: 'canvas-1',
    name: 'docs',
    xynode: { position: { x: 100, y: 100 }, data: {} },
    edges: [],
    nodes: [
      {
        id: 'node-1',
        name: 'hello',
        xynode: { id: 'node-1', type: 'blockNote', position: { x: 120, y: 332 }, data: {} },
        sectionId: 'section-1',
      },
      {
        id: 'node-2',
        name: 'picture',
        xynode: { id: 'node-2', type: 'image', position: { x: 460, y: 332 }, data: {} },
        sectionId: 'section-2',
      },
    ],
    sections: [
      {
        id: 'section-1',
        title: 'Overview',
        layout: 'horizontal',
        position: { x: 120, y: 240 },
        memberIds: ['node-1'],
      },
      {
        id: 'section-2',
        title: 'Assets',
        layout: 'horizontal',
        position: { x: 520, y: 240 },
        memberIds: ['node-2'],
      },
    ],
  })

  const syncManager = new SyncManager({
    workspaceId: 'workspace-live-state-unit',
    yjsServerHost: 'localhost:1999',
    workspacePath: tempDir,
    backendUrl: 'http://localhost:3333',
    authToken: 'test-token',
    userId: 'test-user',
    logger: testLogger,
  })

  const pathMapper = {
    getCanvasMapping: vi.fn((canvasPath: string) =>
      canvasPath === 'docs' ? { path: 'docs', canvasId: 'canvas-1', originalName: 'docs' } : undefined
    ),
    getMapping: vi.fn((relativePath: string) => {
      if (relativePath === 'docs/hello.md') {
        return { path: relativePath, nodeId: 'node-1', canvasId: 'canvas-1', originalName: 'hello', type: 'node' }
      }

      if (relativePath === 'docs/picture.png') {
        return { path: relativePath, nodeId: 'node-2', canvasId: 'canvas-1', originalName: 'picture', type: 'node' }
      }

      if (relativePath === 'other/outside.md') {
        return { path: relativePath, nodeId: 'node-3', canvasId: 'canvas-2', originalName: 'outside', type: 'node' }
      }

      return undefined
    }),
  } as unknown as PathMapper

  ;(syncManager as unknown as { pathMapper: PathMapper | null }).pathMapper = pathMapper
  const handleFileChange = vi.spyOn(syncManager, 'handleFileChange').mockResolvedValue({
    success: true,
    action: 'updated_metadata',
    canvasId: 'canvas-1',
    changedNodeIds: [],
    canvasChanged: true,
  })

  return { syncManager, tempDir, canvasDir, handleFileChange }
}

describe('SyncManager live section state', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns immediately when the section already exists', async () => {
    const { syncManager, root, pathMapper } = createSyncManager()
    const canvas = root.items[0] as CanvasItem
    canvas.sections = [
      { id: 'section-1', title: 'Overview', layout: 'horizontal', position: { x: 120, y: 240 }, memberIds: [] },
    ]

    await expect(
      syncManager.waitForSectionInCanvas({ relativePath: 'docs/hello.md', title: 'Overview', timeoutMs: 0 })
    ).resolves.toBe(true)
    expect(pathMapper.resolveNewFile).toHaveBeenCalledWith('docs/hello.md')
  })

  it('waits until the section appears in live canvas state', async () => {
    const { syncManager, root } = createSyncManager()
    const canvas = root.items[0] as CanvasItem

    const waitPromise = syncManager.waitForSectionInCanvas({
      relativePath: 'docs/hello.md',
      title: 'Overview',
      timeoutMs: 500,
    })

    await vi.advanceTimersByTimeAsync(100)
    canvas.sections = [
      { id: 'section-1', title: 'Overview', layout: 'horizontal', position: { x: 120, y: 240 }, memberIds: [] },
    ]

    await vi.advanceTimersByTimeAsync(100)
    await expect(waitPromise).resolves.toBe(true)
  })

  it('returns false when the section does not appear before timeout', async () => {
    const { syncManager } = createSyncManager()

    const waitPromise = syncManager.waitForSectionInCanvas({
      relativePath: 'docs/missing.md',
      title: 'Overview',
      timeoutMs: 250,
    })

    await vi.advanceTimersByTimeAsync(300)
    await expect(waitPromise).resolves.toBe(false)
  })

  it('resolves file-anchor placement when the anchor file exists in the target canvas', async () => {
    const { syncManager, pathMapper } = createSyncManager()

    await expect(
      syncManager.resolveFileAnchorPlacement({
        targetRelativePath: 'docs/new-file.md',
        anchorFilePath: 'docs/hello.md',
        fallbackSectionTitle: 'Related',
        timeoutMs: 0,
      })
    ).resolves.toEqual({ exists: true, destinationSectionTitle: 'Related', createsSectionTitle: 'Related' })
    expect(pathMapper.resolveNewFile).toHaveBeenCalledWith('docs/new-file.md')
    expect(pathMapper.getMapping).toHaveBeenCalledWith('docs/hello.md')
  })

  it('returns unresolved placement when the anchor file is missing', async () => {
    const { syncManager } = createSyncManager()

    const waitPromise = syncManager.resolveFileAnchorPlacement({
      targetRelativePath: 'docs/new-file.md',
      anchorFilePath: 'docs/missing.md',
      fallbackSectionTitle: 'Related',
      timeoutMs: 250,
    })

    await vi.advanceTimersByTimeAsync(300)
    await expect(waitPromise).resolves.toEqual({
      exists: false,
      destinationSectionTitle: null,
      createsSectionTitle: null,
    })
  })

  it('resolves file-anchor placement to the anchor section when the anchor is already sectioned', async () => {
    const { syncManager, root } = createSyncManager()
    const canvas = root.items[0] as CanvasItem
    canvas.sections = [
      {
        id: 'section-1',
        title: 'Overview',
        layout: 'horizontal',
        position: { x: 120, y: 240 },
        memberIds: ['node-1'],
      },
    ]

    await expect(
      syncManager.resolveFileAnchorPlacement({
        targetRelativePath: 'docs/new-file.md',
        anchorFilePath: 'docs/hello.md',
        fallbackSectionTitle: 'Related',
        timeoutMs: 0,
      })
    ).resolves.toEqual({
      exists: true,
      destinationSectionTitle: 'Overview',
      createsSectionTitle: null,
    })
  })

  it('returns a conflict when an unsectioned anchor would reuse an existing section title', async () => {
    const { syncManager, root } = createSyncManager()
    const canvas = root.items[0] as CanvasItem
    canvas.sections = [
      {
        id: 'section-1',
        title: 'Related',
        layout: 'horizontal',
        position: { x: 120, y: 240 },
        memberIds: ['node-2'],
      },
    ]

    await expect(
      syncManager.resolveFileAnchorPlacement({
        targetRelativePath: 'docs/new-file.md',
        anchorFilePath: 'docs/hello.md',
        fallbackSectionTitle: 'Related',
        timeoutMs: 0,
      })
    ).resolves.toEqual({
      exists: true,
      destinationSectionTitle: null,
      createsSectionTitle: null,
      code: 'section_title_conflict',
      error: 'Section already exists for unsectioned anchor file: Related',
    })
  })

  it('returns the current file section membership from live canvas state', async () => {
    const { syncManager, root } = createSyncManager()
    const canvas = root.items[0] as CanvasItem
    canvas.sections = [
      {
        id: 'section-1',
        title: 'Overview',
        layout: 'horizontal',
        position: { x: 120, y: 240 },
        memberIds: ['node-1', 'node-2'],
      },
    ]

    await expect(syncManager.getFileSectionMembership({ relativePath: 'docs/hello.md' })).resolves.toEqual({
      sectionTitle: 'Overview',
      memberCount: 2,
    })
  })

  it('updates section title and grid layout by ID', async () => {
    const { syncManager, tempDir, canvasDir, handleFileChange } = await createSectionApplyHarness()

    try {
      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [
            {
              type: 'update_section',
              sectionId: 'section-1',
              title: 'Launch',
              layout: 'grid',
              columns: 3,
            },
          ],
        })
      ).resolves.toEqual({ paths: [] })

      const metadata = await readMetadataYaml(canvasDir)
      expect(metadata?.sections?.[0]).toMatchObject({
        id: 'section-1',
        title: 'Launch',
        layout: 'grid',
        columns: 3,
      })
      expect(handleFileChange).toHaveBeenCalledWith('update', path.join(canvasDir, 'metadata.yaml'))
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('moves multiple files into a section by ID and updates node section IDs', async () => {
    const { syncManager, tempDir, canvasDir } = await createSectionApplyHarness()

    try {
      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [{ type: 'move_files', sectionId: 'section-1', paths: ['docs/picture.png'] }],
        })
      ).resolves.toEqual({ paths: ['docs/picture.png'] })

      const metadata = await readMetadataYaml(canvasDir)
      expect(metadata?.sections).toHaveLength(1)
      expect(metadata?.sections?.[0]).toMatchObject({ id: 'section-1', memberIds: ['node-1', 'node-2'] })
      expect(metadata?.nodes.find((node) => node.id === 'node-2')?.sectionId).toBe('section-1')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('creates a section with files at an absolute location', async () => {
    const { syncManager, tempDir, canvasDir } = await createSectionApplyHarness()

    try {
      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [
            {
              type: 'create_section',
              title: 'Checklist',
              layout: 'grid',
              columns: 2,
              location: { mode: 'position', x: 400, y: 100 },
              paths: ['docs/picture.png'],
            },
          ],
        })
      ).resolves.toEqual({ paths: ['docs/picture.png'] })

      const metadata = await readMetadataYaml(canvasDir)
      const created = metadata?.sections?.find((section) => section.title === 'Checklist')
      expect(created).toMatchObject({
        layout: 'grid',
        columns: 2,
        position: { x: 400, y: 100 },
        memberIds: ['node-2'],
      })
      expect(created?.pendingPlacement).toBeUndefined()
      expect(metadata?.nodes.find((node) => node.id === 'node-2')?.sectionId).toBe(created?.id)
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('creates a section with files and resolves anchorSectionId to the final pending placement title', async () => {
    const { syncManager, tempDir, canvasDir } = await createSectionApplyHarness()

    try {
      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [
            {
              type: 'create_section',
              title: 'Checklist',
              layout: 'grid',
              columns: 2,
              location: { mode: 'below', anchorSectionId: 'section-1', gap: 80 },
              paths: ['docs/picture.png'],
            },
            {
              type: 'update_section',
              sectionId: 'section-1',
              title: 'Renamed Overview',
            },
          ],
        })
      ).resolves.toEqual({ paths: ['docs/picture.png'] })

      const metadata = await readMetadataYaml(canvasDir)
      const created = metadata?.sections?.find((section) => section.title === 'Checklist')
      expect(created).toMatchObject({
        layout: 'grid',
        columns: 2,
        memberIds: ['node-2'],
        pendingPlacement: { mode: 'below', anchorSectionTitle: 'Renamed Overview', gap: 80 },
      })
      expect(metadata?.nodes.find((node) => node.id === 'node-2')?.sectionId).toBe(created?.id)
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('fails duplicate section titles before writing metadata', async () => {
    const { syncManager, tempDir, canvasDir, handleFileChange } = await createSectionApplyHarness()
    const before = await fs.readFile(path.join(canvasDir, 'metadata.yaml'), 'utf-8')

    try {
      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [{ type: 'update_section', sectionId: 'section-1', title: 'Assets' }],
        })
      ).rejects.toThrow('Section already exists: Assets')

      await expect(fs.readFile(path.join(canvasDir, 'metadata.yaml'), 'utf-8')).resolves.toBe(before)
      expect(handleFileChange).not.toHaveBeenCalled()
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('rejects columns when the final section layout is not grid', async () => {
    const { syncManager, tempDir, canvasDir, handleFileChange } = await createSectionApplyHarness()
    const before = await fs.readFile(path.join(canvasDir, 'metadata.yaml'), 'utf-8')

    try {
      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [{ type: 'update_section', sectionId: 'section-1', columns: 3 }],
        })
      ).rejects.toThrow('Section columns can only be set when layout is grid.')

      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [
            {
              type: 'create_section',
              title: 'Bad Horizontal Grid',
              layout: 'horizontal',
              columns: 3,
              location: { mode: 'position', x: 400, y: 100 },
              paths: ['docs/picture.png'],
            },
          ],
        })
      ).rejects.toThrow('Section columns can only be set when layout is grid.')

      await expect(fs.readFile(path.join(canvasDir, 'metadata.yaml'), 'utf-8')).resolves.toBe(before)
      expect(handleFileChange).not.toHaveBeenCalled()
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('fails missing section IDs and cross-canvas files before writing metadata', async () => {
    const { syncManager, tempDir } = await createSectionApplyHarness()

    try {
      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [{ type: 'move_files', sectionId: 'missing-section', paths: ['docs/hello.md'] }],
        })
      ).rejects.toThrow('Section not found: missing-section')

      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [{ type: 'move_files', sectionId: 'section-1', paths: ['other/outside.md'] }],
        })
      ).rejects.toThrow('File belongs to a different canvas: other/outside.md')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('fails missing or legacy create_section location before writing metadata', async () => {
    const { syncManager, tempDir, canvasDir, handleFileChange } = await createSectionApplyHarness()
    const before = await fs.readFile(path.join(canvasDir, 'metadata.yaml'), 'utf-8')
    const message =
      'create_section now requires location. Use location: { mode: "position", x, y } or location: { mode: "after" | "below", anchorSectionId, gap? }.'

    try {
      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [
            {
              type: 'create_section',
              title: 'Missing Location',
              layout: 'horizontal',
              paths: ['docs/picture.png'],
            } as any,
          ],
        })
      ).rejects.toThrow(message)

      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [
            {
              type: 'create_section',
              title: 'Legacy Location',
              layout: 'horizontal',
              position: { x: 400, y: 100 },
              paths: ['docs/picture.png'],
            } as any,
          ],
        })
      ).rejects.toThrow(message)

      await expect(fs.readFile(path.join(canvasDir, 'metadata.yaml'), 'utf-8')).resolves.toBe(before)
      expect(handleFileChange).not.toHaveBeenCalled()
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('fails invalid relative create_section location before writing metadata', async () => {
    const { syncManager, tempDir, canvasDir, handleFileChange } = await createSectionApplyHarness()
    const before = await fs.readFile(path.join(canvasDir, 'metadata.yaml'), 'utf-8')

    try {
      await expect(
        syncManager.applySectionChanges({
          canvasPath: 'docs',
          changes: [
            {
              type: 'create_section',
              title: 'Bad Anchor',
              layout: 'horizontal',
              location: { mode: 'after', anchorSectionId: 'missing-section' },
              paths: ['docs/picture.png'],
            },
          ],
        })
      ).rejects.toThrow('Section not found: missing-section')

      await expect(fs.readFile(path.join(canvasDir, 'metadata.yaml'), 'utf-8')).resolves.toBe(before)
      expect(handleFileChange).not.toHaveBeenCalled()
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
