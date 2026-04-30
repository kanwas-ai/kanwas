import type { Node } from '@xyflow/react'

/** Common data props injected into every node by CanvasFlow */
export type CommonNodeData = {
  documentName?: string
  isKanwasProtected?: boolean
  collapsed?: boolean
  emoji?: string
  summary?: string
  originalType?: string
  inGroup?: boolean
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
