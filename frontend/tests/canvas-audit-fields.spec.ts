import { describe, expect, it, vi } from 'vitest'
import type { CanvasItem, NodeItem } from 'shared'
import {
  appendCanvasWithCreateAudit,
  appendNodeWithCreateAudit,
  createUserAuditActor,
  resolveIncomingAuditMetadata,
  resolveAuditActor,
  resolveAuditTimestamp,
  shouldTouchAuditFromBlockNoteTransaction,
  stampCreateAuditOnCanvas,
  stampCreateAuditOnNode,
  touchAuditOnNode,
  touchNodeAndOwnerCanvasAudit,
} from '@/lib/workspaceAudit'

function createNode(id: string, type: NodeItem['xynode']['type']): NodeItem {
  switch (type) {
    case 'blockNote':
      return {
        kind: 'node',
        id,
        name: id,
        xynode: {
          id,
          type,
          position: { x: 0, y: 0 },
          data: {},
        },
      }
    case 'image':
      return {
        kind: 'node',
        id,
        name: id,
        xynode: {
          id,
          type,
          position: { x: 0, y: 0 },
          data: {
            storagePath: `files/${id}.png`,
            mimeType: 'image/png',
            size: 42,
            contentHash: `hash-${id}`,
          },
        },
      }
    case 'file':
      return {
        kind: 'node',
        id,
        name: id,
        xynode: {
          id,
          type,
          position: { x: 0, y: 0 },
          data: {
            storagePath: `files/${id}.pdf`,
            mimeType: 'application/pdf',
            size: 42,
            originalFilename: `${id}.pdf`,
            contentHash: `hash-${id}`,
          },
        },
      }
    case 'audio':
      return {
        kind: 'node',
        id,
        name: id,
        xynode: {
          id,
          type,
          position: { x: 0, y: 0 },
          data: {
            storagePath: `files/${id}.mp3`,
            mimeType: 'audio/mpeg',
            size: 42,
            originalFilename: `${id}.mp3`,
            contentHash: `hash-${id}`,
          },
        },
      }
    case 'link':
      return {
        kind: 'node',
        id,
        name: id,
        xynode: {
          id,
          type,
          position: { x: 0, y: 0 },
          data: {
            url: 'https://example.com',
            loadingStatus: 'pending',
          },
        },
      }
    case 'canvas':
      throw new Error('Use createCanvas for canvas items')
  }
}

function createCanvas(id: string, name: string, items: Array<NodeItem | CanvasItem> = []): CanvasItem {
  return {
    kind: 'canvas',
    id,
    name,
    xynode: {
      id,
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items,
  }
}

describe('workspace audit helpers', () => {
  it('stamps create audit fields for all node types and canvases', () => {
    const actor = createUserAuditActor('user-1')
    const now = '2026-02-20T10:00:00.000Z'

    const nodeTypes: Array<NodeItem['xynode']['type']> = ['blockNote', 'image', 'file', 'audio', 'link']

    for (const [index, type] of nodeTypes.entries()) {
      const node = createNode(`node-${index}`, type)
      stampCreateAuditOnNode(node, actor, now)
      expect(node.xynode.data.audit).toEqual({
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
      })
    }

    const canvas = createCanvas('canvas-1', 'Canvas')
    stampCreateAuditOnCanvas(canvas, actor, now)
    expect(canvas.xynode.data.audit).toEqual({
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    })
  })

  it('appends create-audited items and touches owner canvas', () => {
    const root = createCanvas('root', 'Root')
    const node = createNode('node-1', 'blockNote')
    const childCanvas = createCanvas('child', 'Child')

    appendNodeWithCreateAudit(root, node, 'user:creator', '2026-02-20T10:00:00.000Z')
    appendCanvasWithCreateAudit(root, childCanvas, 'user:creator', '2026-02-20T11:00:00.000Z')

    expect(root.items).toContain(node)
    expect(root.items).toContain(childCanvas)
    expect(node.xynode.data.audit).toEqual({
      createdAt: '2026-02-20T10:00:00.000Z',
      createdBy: 'user:creator',
      updatedAt: '2026-02-20T10:00:00.000Z',
      updatedBy: 'user:creator',
    })
    expect(childCanvas.xynode.data.audit).toEqual({
      createdAt: '2026-02-20T11:00:00.000Z',
      createdBy: 'user:creator',
      updatedAt: '2026-02-20T11:00:00.000Z',
      updatedBy: 'user:creator',
    })
    expect(root.xynode.data.audit).toEqual({
      updatedAt: '2026-02-20T11:00:00.000Z',
      updatedBy: 'user:creator',
    })
  })

  it('touches only the edited node and its direct owner canvas', () => {
    const root = createCanvas('root', 'Root')
    const child = createCanvas('child', 'Child')
    const nested = createCanvas('nested', 'Nested')
    const node = createNode('node-1', 'blockNote')

    root.items.push(child)
    child.items.push(nested)
    nested.items.push(node)

    const oldIso = '2026-02-20T09:00:00.000Z'
    root.xynode.data.audit = {
      createdAt: oldIso,
      createdBy: 'user:owner',
      updatedAt: oldIso,
      updatedBy: 'user:owner',
    }
    nested.xynode.data.audit = {
      createdAt: oldIso,
      createdBy: 'user:owner',
      updatedAt: oldIso,
      updatedBy: 'user:owner',
    }
    node.xynode.data.audit = {
      createdAt: oldIso,
      createdBy: 'user:owner',
      updatedAt: oldIso,
      updatedBy: 'user:owner',
    }

    const newIso = '2026-02-20T11:00:00.000Z'
    const touched = touchNodeAndOwnerCanvasAudit(root, node.id, 'user:editor', newIso)

    expect(touched).toBe(true)
    expect(node.xynode.data.audit).toEqual({
      createdAt: oldIso,
      createdBy: 'user:owner',
      updatedAt: newIso,
      updatedBy: 'user:editor',
    })
    expect(nested.xynode.data.audit).toEqual({
      createdAt: oldIso,
      createdBy: 'user:owner',
      updatedAt: newIso,
      updatedBy: 'user:editor',
    })
    expect(root.xynode.data.audit).toEqual({
      createdAt: oldIso,
      createdBy: 'user:owner',
      updatedAt: oldIso,
      updatedBy: 'user:owner',
    })
  })

  it('resolves actor and timestamp from backend payload with fallback', () => {
    expect(resolveAuditActor('agent:123', 'user:456')).toBe('agent:123')
    expect(resolveAuditActor('invalid', 'user:456')).toBe('user:456')
    expect(resolveAuditActor(undefined, undefined)).toBeUndefined()

    expect(resolveAuditTimestamp('2026-02-20T10:11:12.000Z')).toBe('2026-02-20T10:11:12.000Z')
    expect(resolveAuditTimestamp('invalid', '2026-02-20T00:00:00.000Z')).toBe('2026-02-20T00:00:00.000Z')
  })

  it('resolves incoming audit metadata and warns for missing actor', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const missing = resolveIncomingAuditMetadata('invalid', '2026-02-20T10:11:12.000Z', {
      source: 'AuditSpec',
      details: { itemId: 'item-1' },
    })

    expect(missing).toEqual({
      actor: undefined,
      timestamp: '2026-02-20T10:11:12.000Z',
    })
    expect(warnSpy).toHaveBeenCalledWith('[AuditSpec] Missing audit actor', { itemId: 'item-1' })

    warnSpy.mockClear()

    const present = resolveIncomingAuditMetadata('agent:123', '2026-02-20T10:11:12.000Z', {
      source: 'AuditSpec',
    })

    expect(present).toEqual({
      actor: 'agent:123',
      timestamp: '2026-02-20T10:11:12.000Z',
    })
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('skips audit touches for remote blocknote sync transactions', () => {
    expect(
      shouldTouchAuditFromBlockNoteTransaction({
        docChanged: true,
        isFocused: true,
        isYSyncChangeOrigin: true,
      })
    ).toBe(false)

    expect(
      shouldTouchAuditFromBlockNoteTransaction({
        docChanged: false,
        isFocused: true,
        isYSyncChangeOrigin: false,
      })
    ).toBe(false)

    expect(
      shouldTouchAuditFromBlockNoteTransaction({
        docChanged: true,
        isFocused: false,
        isYSyncChangeOrigin: false,
      })
    ).toBe(false)

    expect(
      shouldTouchAuditFromBlockNoteTransaction({
        docChanged: true,
        isFocused: true,
        isYSyncChangeOrigin: false,
      })
    ).toBe(true)
  })

  it('preserves created fields when touching updates', () => {
    const node = createNode('node-preserve', 'blockNote')
    node.xynode.data.audit = {
      createdAt: '2026-02-19T00:00:00.000Z',
      createdBy: 'user:creator',
      updatedAt: '2026-02-19T00:00:00.000Z',
      updatedBy: 'user:creator',
    }

    touchAuditOnNode(node, 'user:editor', '2026-02-20T00:00:00.000Z')

    expect(node.xynode.data.audit).toEqual({
      createdAt: '2026-02-19T00:00:00.000Z',
      createdBy: 'user:creator',
      updatedAt: '2026-02-20T00:00:00.000Z',
      updatedBy: 'user:editor',
    })
  })
})
