import { describe, expect, it } from 'vitest'
import { createYjsProxy, VALTIO_Y_ORIGIN } from 'valtio-y'
import * as Y from 'yjs'

type Section = {
  id: string
  title: string
  layout: 'grid'
  position: { x: number; y: number }
  memberIds: string[]
  columns: number
}

type TestState = {
  root?: {
    id: string
    sections: Section[]
  }
}

async function flushQueuedYjsWrites(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createSections(): Section[] {
  return [
    {
      id: 'full-section',
      title: 'Full section',
      layout: 'grid',
      position: { x: 0, y: 0 },
      memberIds: ['full-a', 'full-b'],
      columns: 2,
    },
    {
      id: 'partial-section',
      title: 'Partial section',
      layout: 'grid',
      position: { x: 0, y: 300 },
      memberIds: ['partial-a', 'partial-b', 'partial-c'],
      columns: 2,
    },
  ]
}

function readRoot(doc: Y.Doc): NonNullable<TestState['root']> {
  const root = doc.getMap('state').get('root') as { toJSON?: () => NonNullable<TestState['root']> } | undefined
  if (!root?.toJSON) {
    throw new Error('Expected Yjs root map')
  }

  return root.toJSON()
}

function collectSectionsWithoutMemberIds(doc: Y.Doc): string[] {
  return readRoot(doc)
    .sections.filter((section) => !Array.isArray(section.memberIds))
    .map((section) => section.id)
}

async function captureUndoReloadState(
  doc: Y.Doc,
  undoManager: Y.UndoManager
): Promise<{ localInvalidSectionIds: string[]; reloadInvalidSectionIds: string[]; updateCount: number }> {
  const deleteStateUpdate = Y.encodeStateAsUpdate(doc)
  const undoUpdates: Uint8Array[] = []
  const captureUpdate = (update: Uint8Array) => {
    undoUpdates.push(update)
  }

  doc.on('update', captureUpdate)
  try {
    undoManager.undo()
    await flushQueuedYjsWrites()
  } finally {
    doc.off('update', captureUpdate)
  }

  const freshDoc = new Y.Doc()
  try {
    Y.applyUpdate(freshDoc, deleteStateUpdate)
    for (const update of undoUpdates) {
      Y.applyUpdate(freshDoc, update)
    }

    return {
      localInvalidSectionIds: collectSectionsWithoutMemberIds(doc),
      reloadInvalidSectionIds: collectSectionsWithoutMemberIds(freshDoc),
      updateCount: undoUpdates.length,
    }
  } finally {
    freshDoc.destroy()
  }
}

describe('valtio-y proxy reuse undo repro', () => {
  it('preserves nested arrays when a proxied child is reused in a replaced array', async () => {
    const doc = new Y.Doc()
    const { proxy: state, dispose } = createYjsProxy<TestState>(doc, {
      getRoot: (yDoc) => yDoc.getMap('state'),
    })
    const undoManager = new Y.UndoManager(doc.getMap('state'), {
      trackedOrigins: new Set([VALTIO_Y_ORIGIN]),
      captureTimeout: 0,
    })

    try {
      state.root = { id: 'root', sections: createSections() }
      await flushQueuedYjsWrites()
      undoManager.clear()

      const retainedSectionProxy = state.root.sections[1]
      retainedSectionProxy.memberIds = ['partial-c']
      state.root.sections = [retainedSectionProxy]
      await flushQueuedYjsWrites()

      expect(readRoot(doc).sections).toEqual([
        expect.objectContaining({
          id: 'partial-section',
          memberIds: ['partial-c'],
        }),
      ])

      const result = await captureUndoReloadState(doc, undoManager)

      expect(result.updateCount).toBeGreaterThan(0)
      expect(result.localInvalidSectionIds).toEqual([])
      expect(result.reloadInvalidSectionIds).toEqual([])
    } finally {
      undoManager.destroy()
      dispose()
      doc.destroy()
    }
  })

  it('does not drop nested arrays when the retained child is rebuilt as plain data', async () => {
    const doc = new Y.Doc()
    const { proxy: state, dispose } = createYjsProxy<TestState>(doc, {
      getRoot: (yDoc) => yDoc.getMap('state'),
    })
    const undoManager = new Y.UndoManager(doc.getMap('state'), {
      trackedOrigins: new Set([VALTIO_Y_ORIGIN]),
      captureTimeout: 0,
    })

    try {
      state.root = { id: 'root', sections: createSections() }
      await flushQueuedYjsWrites()
      undoManager.clear()

      const retainedSection = state.root.sections[1]
      state.root.sections = [
        {
          id: retainedSection.id,
          title: retainedSection.title,
          layout: retainedSection.layout,
          position: { ...retainedSection.position },
          memberIds: ['partial-c'],
          columns: retainedSection.columns,
        },
      ]
      await flushQueuedYjsWrites()

      expect(readRoot(doc).sections).toEqual([
        expect.objectContaining({
          id: 'partial-section',
          memberIds: ['partial-c'],
        }),
      ])

      const result = await captureUndoReloadState(doc, undoManager)

      expect(result.updateCount).toBeGreaterThan(0)
      expect(result.localInvalidSectionIds).toEqual([])
      expect(result.reloadInvalidSectionIds).toEqual([])
    } finally {
      undoManager.destroy()
      dispose()
      doc.destroy()
    }
  })
})
