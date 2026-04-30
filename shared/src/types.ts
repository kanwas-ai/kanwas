import type { Node as XYFlowNode, Edge } from '@xyflow/react'

// ============================================================================
// NODE DATA TYPES (unchanged from current implementation)
// ============================================================================

export interface AuditFields {
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  updatedBy?: string
}

export type SectionLayout = 'horizontal' | 'grid'

export type SectionRelativePlacement = {
  mode: 'after' | 'below'
  anchorSectionTitle: string
  gap?: number
}

export type SectionFileAnchorPlacement = {
  mode: 'with_file'
  anchorFilePath: string
}

export type FileSectionPlacement = SectionRelativePlacement | SectionFileAnchorPlacement

export interface SectionDef {
  id: string
  title: string
  layout: SectionLayout
  position: { x: number; y: number }
  memberIds: string[]
  columns?: number
  pendingPlacement?: SectionRelativePlacement
}

export type FileSection =
  | {
      mode: 'create'
      title: string
      layout: SectionLayout
      x: number
      y: number
      columns?: number
    }
  | {
      mode: 'create'
      title: string
      layout: SectionLayout
      placement: FileSectionPlacement
      columns?: number
    }
  | {
      mode: 'join'
      title: string
    }

export type PendingCanvasPlacement = {
  source: 'filesystem'
  reason: 'created' | 'moved'
}

type SectionMembershipFields = {
  sectionId?: string
  pendingCanvasPlacement?: PendingCanvasPlacement
}

export interface MetadataAuditActor {
  actor: string
  id: string | null
  name: string | null
  email: string | null
}

export interface MetadataAuditFields {
  createdAt?: string
  updatedAt?: string
  createdBy?: MetadataAuditActor
  updatedBy?: MetadataAuditActor
}

export type BlockNoteSystemNodeKind = 'kanwas_md'

export type BlockNoteNodeData = {
  documentName?: string
  static?: boolean
  isPreviewCreate?: boolean
  systemNodeKind?: BlockNoteSystemNodeKind
  explicitlyEdited?: boolean
  summary?: string
  emoji?: string
  audit?: AuditFields
} & SectionMembershipFields

export type ImageNodeData = {
  storagePath: string // "files/{workspaceId}/{canvasId}/{filename}"
  mimeType: string // "image/png", "image/jpeg", "image/gif", "image/webp"
  width?: number // Natural image width (pixels)
  height?: number // Natural image height (pixels)
  size: number // File size in bytes
  contentHash: string // SHA-256 hash for cache invalidation
  audit?: AuditFields
} & SectionMembershipFields

export type FileNodeData = {
  documentName?: string // Display name for the node
  storagePath: string // "files/{workspaceId}/{canvasId}/{filename}"
  mimeType: string // "application/pdf", "text/csv", etc.
  size: number // File size in bytes
  originalFilename: string // Preserve original filename for display
  contentHash: string // SHA-256 hash for cache invalidation
  audit?: AuditFields
} & SectionMembershipFields

export type AudioNodeData = {
  storagePath: string // "files/{workspaceId}/{canvasId}/{filename}"
  mimeType: string // "audio/mpeg", "audio/wav", etc.
  size: number // File size in bytes
  originalFilename: string // Preserve original filename for display
  duration?: number // Optional: audio duration in seconds (future enhancement)
  contentHash: string // SHA-256 hash for cache invalidation
  audit?: AuditFields
} & SectionMembershipFields

export type LinkNodeData = {
  url: string // The URL (mandatory)
  title?: string // OG title
  description?: string // OG description
  imageStoragePath?: string // Stored OG image path
  siteName?: string // OG site name
  favicon?: string // Site favicon URL
  displayMode?: 'preview' | 'iframe' // Collaborative view mode for the link node
  loadingStatus: 'pending' | 'loading' | 'loaded' | 'error'
  audit?: AuditFields
} & SectionMembershipFields

// ============================================================================
// XYFLOW NODE TYPES
// ============================================================================

export type BlockNoteNode = XYFlowNode<BlockNoteNodeData, 'blockNote'>
export type ImageNode = XYFlowNode<ImageNodeData, 'image'>
export type FileNode = XYFlowNode<FileNodeData, 'file'>
export type AudioNode = XYFlowNode<AudioNodeData, 'audio'>
export type LinkNode = XYFlowNode<LinkNodeData, 'link'>

export type NodeFontFamily = 'caveat' | 'libre-baskerville' | 'inter'

export type TextNodeData = {
  content: string
  fontSize?: number // default 36
  fontFamily?: NodeFontFamily // default 'caveat'
  color?: string // CSS color string
  audit?: AuditFields
} & SectionMembershipFields

export type TextNode = XYFlowNode<TextNodeData, 'text'>

export type StickyNoteNodeData = {
  color?: 'yellow' | 'pink' | 'green' | 'blue' | 'orange' | 'purple' // default 'yellow'
  fontFamily?: NodeFontFamily // default 'caveat'
  audit?: AuditFields
} & SectionMembershipFields

export type StickyNoteNode = XYFlowNode<StickyNoteNodeData, 'stickyNote'>

// Canvas node data (for the visual representation of a canvas on its parent)
export type CanvasNodeData = {
  // Can be extended with preview data, item count, etc.
  audit?: AuditFields
}

export type CanvasXyNode = XYFlowNode<CanvasNodeData, 'canvas'>

export type XyNode =
  | BlockNoteNode
  | CanvasXyNode
  | ImageNode
  | FileNode
  | AudioNode
  | LinkNode
  | TextNode
  | StickyNoteNode

// ============================================================================
// WORKSPACE TREE STRUCTURE
// ============================================================================

/** A lightweight group container for collapsed nodes on a canvas */
export interface GroupDef {
  id: string
  name: string
  position: { x: number; y: number }
  memberIds: string[] // ordered refs to NodeItem IDs — index = grid cell
  color?: string // optional background tint (hex)
  columns?: number // default GROUP_LAYOUT.COLUMNS (2)
}

/** Common base for everything in the tree */
interface BaseTreeItem {
  id: string // Unique identifier for this item
  name: string // Display name
  kind: 'canvas' | 'node'
}

export interface NodeItem extends BaseTreeItem {
  kind: 'node'
  xynode: XyNode
  collapsed?: boolean // undefined/false = expanded, true = collapsed
  summary?: string
  emoji?: string
}

/** CANVAS: can contain nodes and child canvases */
export interface CanvasItem extends BaseTreeItem {
  kind: 'canvas'
  xynode: CanvasXyNode // Required - root uses position {x:0, y:0}
  edges: Edge[] // Connections between nodes
  items: (NodeItem | CanvasItem)[] // Unified array of nodes and child canvases
  groups?: GroupDef[] // Optional node groups for compact layout
  sections?: SectionDef[] // Optional section containers for structured canvas layout
}

/** Root workspace document structure */
export interface WorkspaceDocument {
  root: CanvasItem // Root IS a canvas (not an array)
}

// ============================================================================
// FILESYSTEM METADATA (for metadata.yaml serialization)
// ============================================================================

/** Metadata structure stored in metadata.yaml for canvas directories */
export interface CanvasMetadata {
  id: string
  name: string
  xynode: {
    position: { x: number; y: number }
    measured?: { width?: number; height?: number }
    data?: {
      audit?: MetadataAuditFields
    }
  }
  edges: Array<{
    id: string
    source: string
    target: string
  }>
  nodes: Array<{
    id: string
    name: string
    xynode: {
      id: string
      type: string
      position: { x: number; y: number }
      measured?: { width?: number; height?: number }
      data: Record<string, unknown>
      width?: number
      height?: number
    }
    collapsed?: boolean
    summary?: string
    emoji?: string
    sectionId?: string
  }>
  groups?: GroupDef[]
  sections?: SectionDef[]
}

// Re-export Edge type for convenience
export type { Edge }
