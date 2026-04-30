// Export logging interface
export type { Logger } from './logging/types.js'
export { noopLogger } from './logging/types.js'

export { buildDocumentSharePath, buildWorkspaceRootPath } from './document-share.js'
export type {
  DocumentShareAccessMode,
  DocumentShareRecord,
  DocumentShareOwnerState,
  WorkspaceDocumentSharesState,
  ActivePublicDocumentShare,
  RevokedPublicDocumentShare,
  MissingPublicDocumentShare,
  PublicDocumentShareResolveResult,
  ActiveDocumentShareSocketAccess,
  RevokedDocumentShareSocketAccess,
  MissingDocumentShareSocketAccess,
  DocumentShareSocketAccessResolveResult,
} from './document-share.js'

// Export shared types
export type {
  AuditFields,
  FileSection,
  MetadataAuditActor,
  MetadataAuditFields,
  Edge,
  BlockNoteNode,
  BlockNoteNodeData,
  BlockNoteSystemNodeKind,
  ImageNode,
  ImageNodeData,
  FileNode,
  FileNodeData,
  AudioNode,
  AudioNodeData,
  LinkNode,
  LinkNodeData,
  TextNode,
  TextNodeData,
  StickyNoteNode,
  StickyNoteNodeData,
  NodeFontFamily,
  WorkspaceDocument,
  NodeItem,
  CanvasItem,
  XyNode,
  CanvasXyNode,
  CanvasMetadata,
  GroupDef,
  SectionDef,
  SectionLayout,
  SectionRelativePlacement,
  SectionFileAnchorPlacement,
  FileSectionPlacement,
  PendingCanvasPlacement,
} from './types.js'

export {
  normalizeAuditActor,
  isValidAuditActor,
  parseAuditActor,
  stampAuditOnCreate,
  touchAuditOnUpdate,
  mergeAuditFields,
  toMetadataAuditActorIdentity,
  collectAuditActors,
  resolveAuditIdentities,
  toMetadataAuditFields,
  getNodeAudit,
  setNodeAudit,
  getCanvasAudit,
  setCanvasAudit,
  stampCreateAuditOnNode,
  stampCreateAuditOnCanvas,
  touchAuditIfNodeUpdated,
  touchAuditIfCanvasUpdated,
} from './workspace/audit.js'
export type { ParsedAuditActor, AuditIdentity, MetadataAuditActorIdentity } from './workspace/audit.js'

// Export workspace client
export { connectToWorkspace, connectToNote } from './workspace/client.js'
export type { ConnectOptions, WorkspaceConnection, ConnectNoteOptions, NoteConnection } from './workspace/client.js'
export { WorkspaceSocketProvider } from './workspace/socketio-provider.js'
export type {
  WorkspaceProviderStatus,
  WorkspaceProviderStatusEvent,
  WorkspaceReloadEvent,
  WorkspaceProviderOptions,
  WorkspaceSocketProviderInstance,
} from './workspace/socketio-provider.js'
export { NoteSocketProvider } from './workspace/note-socketio-provider.js'
export type {
  NoteProviderStatus,
  NoteProviderStatusEvent,
  NoteReloadEvent,
  NoteProviderOptions,
  NoteSocketProviderInstance,
} from './workspace/note-socketio-provider.js'

// Export workspace utilities (browser-safe)
export { once } from './utils/once.js'
export { isFileSection, parseFileSection } from './section.js'
export { PathMapper, makeUniqueName } from './workspace/path-mapper.js'
export type { PathMapping, CanvasMapping } from './workspace/path-mapper.js'
export {
  formatWorkspaceTree,
  formatActiveCanvasContext,
  formatWorkspaceInvokeContext,
  findCanvasPath,
  getSelectedNodesInfo,
} from './workspace/tree-formatter.js'
export type {
  ActiveCanvasContextOptions,
  WorkspaceInvokeContext,
  WorkspaceInvokeContextOptions,
  SelectedNodeInfo,
} from './workspace/tree-formatter.js'
export { CanvasTreeValidationError, assertValidCanvasTree, assertValidWorkspaceRoot } from './workspace/canvas-tree.js'
export type { CanvasTreeValidationReason, CanvasTreeValidationSummary } from './workspace/canvas-tree.js'

export { createWorkspaceContentStore, YjsWorkspaceContentStore } from './workspace/workspace-content-store.js'
export type { WorkspaceContentStore } from './workspace/workspace-content-store.js'

export {
  WORKSPACE_NOTES_MAP_KEY,
  NOTE_META_KEY,
  NOTE_CONTENT_KEY,
  NOTE_SCHEMA_VERSION,
  isNoteContentKind,
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

export { copyBlockNoteFragment } from './workspace/blocknote-fragment-copy.js'
export { sanitizeCanvasMetadata } from './workspace/metadata-sanitizer.js'

export type {
  CreateNoteBundleNotePayload,
  WorkspaceDocKind,
  WorkspaceDocRef,
  WorkspaceDocEnvelope,
  WorkspaceRootBootstrapDoc,
  WorkspaceNoteBootstrapDoc,
  WorkspaceBootstrapDoc,
  WorkspaceBootstrapPayload,
  WorkspaceDocMessagePayload,
  WorkspaceDocAwarenessPayload,
  CreateNoteBundlePayload,
  WorkspaceAwarenessSubscriptionAction,
  WorkspaceAwarenessSubscriptionPayload,
  WorkspaceSnapshotBundle,
} from './workspace/workspace-sync-types.js'
export { decodeBootstrapPayload, encodeBootstrapPayload } from './workspace/bootstrap-codec.js'
export type { BootstrapBinaryPayload } from './workspace/bootstrap-codec.js'

// Export layout constants and utilities
export {
  // String utilities
  sanitizeFilename,
  NODE_LAYOUT,
  CANVAS_NODE_LAYOUT,
  IMAGE_NODE_LAYOUT,
  FILE_NODE_LAYOUT,
  AUDIO_NODE_LAYOUT,
  LINK_NODE_LAYOUT,
  LINK_IFRAME_LAYOUT,
  NODE_NAME_HEIGHT,
  TEXT_NODE_LAYOUT,
  STICKY_NOTE_NODE_LAYOUT,
  // Unified position calculation
  calculateItemPosition,
  findTargetCanvas,
  // Image display size calculation
  calculateImageDisplaySize,
  // Image node constants
  SUPPORTED_IMAGE_EXTENSIONS,
  MAX_IMAGE_SIZE_BYTES,
  MIME_TO_EXTENSION,
  EXTENSION_TO_MIME,
  isImageExtension,
  getExtensionFromMimeType,
  getMimeTypeFromExtension,
  // File node constants
  SUPPORTED_FILE_EXTENSIONS,
  getFileTypeIcon,
  formatFileSize,
  isFileExtension,
  FILE_ICON_MAP,
  getFileIconName,
  // Audio node constants
  SUPPORTED_AUDIO_EXTENSIONS,
  isAudioExtension,
} from './constants.js'
export type {
  SupportedImageExtension,
  SupportedFileExtension,
  SupportedAudioExtension,
  PositionDirection,
  PositionOptions,
} from './constants.js'

// Export skills system
export type {
  SkillName,
  SkillDescription,
  SkillMetadata,
  ParsedSkill,
  StoredSkill,
  SkillParseResult,
  SkillParseError,
  SkillParseOutcome,
  SkillValidationResult,
  SkillSummary,
  SkillActivation,
} from './skills/index.js'

export {
  skillNameSchema,
  skillDescriptionSchema,
  skillMetadataSchema,
  parsedSkillSchema,
  storedSkillSchema,
  parseSkillMd,
  serializeSkillMd,
  validateSkillName,
  validateSkillDescription,
  validateSkillMetadata,
  isReservedName,
  RESERVED_WORDS,
} from './skills/index.js'
