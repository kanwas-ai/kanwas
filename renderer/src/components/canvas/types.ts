import type { Node } from '@xyflow/react'

/** Kind bucket for a folder card's shelf tiles (see FolderPeek) */
export type FolderPeekKind = 'canvas' | 'document' | 'image' | 'file' | 'link' | 'note'

/**
 * Lightweight peek at a folder's contents for the canvas "folder card" shelf.
 * Only the first 3 direct children's kinds + the total direct-child count —
 * that's all the shelf needs to render.
 */
export type FolderPeek = {
  kinds: FolderPeekKind[]
  count: number
}

/** Common data props injected into every node by CanvasFlow */
export type CommonNodeData = {
  documentName?: string
  isKanwasProtected?: boolean
  collapsed?: boolean
  emoji?: string
  summary?: string
  originalType?: string
  inGroup?: boolean
  /** Folder card contents preview (kind === 'canvas' items only) */
  folderPeek?: FolderPeek
  /** Whether this folder's parent canvas is the workspace root (drives semantic icon lookup) */
  isTopLevelCanvas?: boolean
  onCanvasSelect?: (id: string) => void
  onFocusNode?: (id: string) => void
  onSelectNode?: (id: string) => void
  onDeselectNode?: (id: string) => void
  onWorkspaceLinkNavigate?: (href: string) => boolean
  onExpandNode?: (id: string) => void
  onCollapseNode?: (id: string) => void
}

/** Augment a shared Node type with CanvasFlow-injected data props */
export type WithCanvasData<N extends Node> = N extends Node<infer D, infer T> ? Node<D & CommonNodeData, T> : never
