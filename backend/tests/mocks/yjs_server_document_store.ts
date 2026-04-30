import type { WorkspaceSnapshotBundle } from 'shared'
import { encodeSnapshotDocument } from 'shared/server'

const mockYjsServerDocuments = new Map<string, WorkspaceSnapshotBundle>()

function cloneSnapshotBundle(document: WorkspaceSnapshotBundle): WorkspaceSnapshotBundle {
  return {
    root: document.root,
    notes: { ...document.notes },
  }
}

export function getMockYjsServerDocument(workspaceId: string): Uint8Array | undefined {
  const document = mockYjsServerDocuments.get(workspaceId)
  return document ? Uint8Array.from(Buffer.from(document.root, 'base64')) : undefined
}

export function setMockYjsServerSnapshot(workspaceId: string, document: WorkspaceSnapshotBundle): void {
  mockYjsServerDocuments.set(workspaceId, cloneSnapshotBundle(document))
}

export function setMockYjsServerRootDocument(workspaceId: string, document: Uint8Array | Buffer): void {
  mockYjsServerDocuments.set(workspaceId, {
    root: encodeSnapshotDocument(document),
    notes: {},
  })
}

export function getMockYjsServerSnapshot(workspaceId: string): WorkspaceSnapshotBundle | undefined {
  const document = mockYjsServerDocuments.get(workspaceId)
  return document ? cloneSnapshotBundle(document) : undefined
}

export function clearMockYjsServerDocuments(): void {
  mockYjsServerDocuments.clear()
}
