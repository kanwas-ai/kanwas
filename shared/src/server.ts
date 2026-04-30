// Server-only exports (Node.js — uses @blocknote/server-util, Buffer APIs, crypto)
// Frontend code must NOT import from 'shared/server' — it will pull in jsdom and other Node.js deps.

export { workspaceToFilesystem } from './workspace/converter.js'
export type { FSNode, FileFetcher, ConverterOptions } from './workspace/converter.js'
export { BINARY_FILE_TYPES } from './workspace/binary-types.js'
export type { BinaryFileExtension } from './workspace/binary-types.js'

export { ContentConverter } from './workspace/content-converter.js'
export { createServerBlockNoteEditor, serverBlockNoteSchema } from './workspace/server-blocknote.js'
export { copyBlockNoteFragment } from './workspace/blocknote-fragment-copy.js'

export { createWorkspaceContentStore, YjsWorkspaceContentStore } from './workspace/workspace-content-store.js'
export type { WorkspaceContentStore } from './workspace/workspace-content-store.js'

export {
  WORKSPACE_NOTES_MAP_KEY,
  NOTE_META_KEY,
  NOTE_CONTENT_KEY,
  NOTE_SCHEMA_VERSION,
  findWorkspaceNotesMap,
  ensureWorkspaceNotesMap,
  listWorkspaceNoteIds,
  getNoteDoc,
  hasNoteDoc,
  setNoteDoc,
  deleteNoteDoc,
  findNoteMetaMap,
  ensureNoteMetaMap,
  getNoteDocMeta,
  getNoteContentKind,
  findNoteBlockNoteFragment,
  ensureNoteBlockNoteFragment,
  ensureNoteDocInitialized,
  createNoteDoc,
  ensureAttachedNoteDoc,
} from './workspace/note-doc.js'
export type { NoteContentKind, NoteDocMeta } from './workspace/note-doc.js'

export type {
  WorkspaceDocKind,
  WorkspaceDocRef,
  WorkspaceDocEnvelope,
  WorkspaceRootBootstrapDoc,
  WorkspaceNoteBootstrapDoc,
  WorkspaceBootstrapDoc,
  WorkspaceBootstrapPayload,
  WorkspaceDocMessagePayload,
  WorkspaceDocAwarenessPayload,
  WorkspaceAwarenessSubscriptionAction,
  WorkspaceAwarenessSubscriptionPayload,
  WorkspaceSnapshotBundle,
} from './workspace/workspace-sync-types.js'

export {
  encodeSnapshotDocument,
  decodeSnapshotDocument,
  createWorkspaceSnapshotBundle,
  applyWorkspaceSnapshotBundle,
  hydrateWorkspaceSnapshotBundle,
} from './workspace/snapshot-bundle.js'

export { FilesystemSyncer, createNoOpFileUploader, createNoOpFileReader } from './workspace/filesystem-syncer.js'
export type {
  FileSection,
  FileSectionPlacement,
  SectionFileAnchorPlacement,
  SectionRelativePlacement,
} from './types.js'

export type {
  FileChange,
  SyncResult,
  SyncAction,
  FileUploader,
  FileReader,
  FileUploadResult,
  FilesystemSyncerOptions,
} from './workspace/filesystem-syncer.js'

export { getImageDimensionsFromBuffer, createFakeImageBuffer } from './image-utils.js'
