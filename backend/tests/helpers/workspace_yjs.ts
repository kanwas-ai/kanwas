import type Workspace from '#models/workspace'
import { once, type WorkspaceDocument, type WorkspaceSnapshotBundle } from 'shared'
import { createWorkspaceSnapshotBundle, hydrateWorkspaceSnapshotBundle } from 'shared/server'
import { createYjsProxy } from 'valtio-y'
import * as Y from 'yjs'
import {
  getMockYjsServerDocument,
  getMockYjsServerSnapshot,
  setMockYjsServerSnapshot,
} from '#tests/mocks/yjs_server_document_store'

export interface WorkspaceYDocState {
  proxy: WorkspaceDocument
  yDoc: Y.Doc
  cleanup: () => void
}

function createWorkspaceYDocState(yDoc: Y.Doc): WorkspaceYDocState {
  const { proxy, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
    getRoot: (doc) => doc.getMap('state'),
  })

  const cleanup = once(() => {
    dispose()
    yDoc.destroy()
  })

  return { proxy, yDoc, cleanup }
}

export function decodeWorkspaceDocument(document: Uint8Array): WorkspaceYDocState {
  const yDoc = new Y.Doc()
  Y.applyUpdateV2(yDoc, document)
  return createWorkspaceYDocState(yDoc)
}

export function decodeWorkspaceSnapshotBundle(snapshot: WorkspaceSnapshotBundle): WorkspaceYDocState {
  return createWorkspaceYDocState(hydrateWorkspaceSnapshotBundle(snapshot))
}

export function readWorkspaceSnapshotBundle(workspace: Workspace): WorkspaceSnapshotBundle {
  const storedDocument = getMockYjsServerSnapshot(workspace.id)
  if (!storedDocument) {
    throw new Error(`Workspace ${workspace.id} has no document in mock Yjs server store`)
  }

  return storedDocument
}

export function readWorkspaceDocumentBytes(workspace: Workspace): Uint8Array {
  const storedDocument = getMockYjsServerDocument(workspace.id)
  if (!storedDocument) {
    throw new Error(`Workspace ${workspace.id} has no document in mock Yjs server store`)
  }

  return storedDocument
}

export function readWorkspaceDocumentBase64(workspace: Workspace): string {
  return Buffer.from(readWorkspaceDocumentBytes(workspace)).toString('base64')
}

export function loadWorkspaceYDoc(workspace: Workspace): WorkspaceYDocState {
  return decodeWorkspaceSnapshotBundle(readWorkspaceSnapshotBundle(workspace))
}

export async function flushYjsTicks(ticks: number = 2): Promise<void> {
  for (let index = 0; index < ticks; index++) {
    await new Promise<void>((resolve) => queueMicrotask(resolve))
  }
}

export async function saveWorkspaceYDoc(workspace: Workspace, yDoc: Y.Doc): Promise<void> {
  await flushYjsTicks(2)
  setMockYjsServerSnapshot(workspace.id, createWorkspaceSnapshotBundle(yDoc))
}
