import * as Y from 'yjs'
import { createYjsProxy } from 'valtio-y'
import { createWorkspaceContentStore, type WorkspaceDocument } from 'shared'
import { copyBlockNoteFragment, hydrateWorkspaceSnapshotBundle } from 'shared/server'
import WorkspaceBootstrapService, { type CreateWorkspaceBootstrapOptions } from '#services/workspace_bootstrap_service'

const LEGACY_EDITORS_MAP_KEY = 'editors'

export function getLegacyEditorsMap(yDoc: Y.Doc): Y.Map<Y.XmlFragment> {
  return yDoc.getMap(LEGACY_EDITORS_MAP_KEY)
}

export async function createLegacyWorkspaceDocument(options: CreateWorkspaceBootstrapOptions = {}): Promise<Buffer> {
  const bootstrapService = new WorkspaceBootstrapService()
  const snapshot = await bootstrapService.createSnapshotBundle(options)
  const sourceDoc = hydrateWorkspaceSnapshotBundle(snapshot)
  const contentStore = createWorkspaceContentStore(sourceDoc)

  const { proxy: sourceProxy, dispose: disposeSource } = createYjsProxy<WorkspaceDocument>(sourceDoc, {
    getRoot: (doc) => doc.getMap('state'),
  })

  const legacyDoc = new Y.Doc()
  const { bootstrap: bootstrapLegacy, dispose: disposeLegacy } = createYjsProxy<WorkspaceDocument>(legacyDoc, {
    getRoot: (doc) => doc.getMap('state'),
  })

  try {
    if (!sourceProxy.root) {
      throw new Error('Bootstrap snapshot is missing root canvas state')
    }

    bootstrapLegacy({ root: JSON.parse(JSON.stringify(sourceProxy.root)) as WorkspaceDocument['root'] })

    const editors = getLegacyEditorsMap(legacyDoc)
    for (const noteId of contentStore.listNoteIds()) {
      const noteKind = contentStore.getNoteKind(noteId)

      if (noteKind !== 'blockNote') {
        throw new Error(`Bootstrap snapshot note ${noteId} has unknown content kind`)
      }

      const sourceFragment = contentStore.getBlockNoteFragment(noteId)
      if (!sourceFragment) {
        throw new Error(`Bootstrap snapshot note ${noteId} is missing BlockNote content`)
      }

      editors.set(noteId, new Y.XmlFragment())
      const targetFragment = editors.get(noteId)
      if (!(targetFragment instanceof Y.XmlFragment)) {
        throw new Error(`Failed to attach legacy BlockNote fragment for ${noteId}`)
      }

      copyBlockNoteFragment(sourceFragment, targetFragment)
    }

    return Buffer.from(Y.encodeStateAsUpdateV2(legacyDoc))
  } finally {
    disposeLegacy()
    disposeSource()
    legacyDoc.destroy()
    sourceDoc.destroy()
  }
}
