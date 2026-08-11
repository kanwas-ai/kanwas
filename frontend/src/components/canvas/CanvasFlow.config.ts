import type { CanvasItem, NodeItem } from 'shared'
import BlockNoteNode from './nodes/BlockNoteNode'
import CanvasNode from './nodes/CanvasNode'
import ImageNode from './nodes/ImageNode'
import FileNode from './nodes/FileNode'
import AudioNode from './nodes/AudioNode'
import LinkNode from './nodes/LinkNode'
import TextNode from './nodes/TextNode'
import StickyNoteNode from './nodes/StickyNoteNode'
import CollapsedCardNode from './nodes/CollapsedCardNode'
import { GroupBackgroundNode } from './group'
import { SectionBackgroundNode } from './section'

export const canvasNodeTypes = {
  blockNote: BlockNoteNode,
  canvas: CanvasNode,
  image: ImageNode,
  file: FileNode,
  audio: AudioNode,
  link: LinkNode,
  text: TextNode,
  stickyNote: StickyNoteNode,
  collapsedCard: CollapsedCardNode,
  groupBackground: GroupBackgroundNode,
  sectionBackground: SectionBackgroundNode,
}

export const defaultCanvasViewport = { x: 0, y: 0, zoom: 0.6 }

export const EMPTY_CANVAS_ID_SET = new Set<string>()
export const LINK_NODE_DRAG_HANDLE = '.link-node-drag-handle'

export function defaultCollapsedNodeEmoji(type: string): string {
  switch (type) {
    case 'blockNote':
      return '\u{1F4DD}'
    default:
      return '\u{1F4C4}'
  }
}

export function getCurrentNodeHeight(item: CanvasItem | NodeItem): number | null {
  const currentHeight = item.xynode.measured?.height
  if (typeof currentHeight !== 'number' || currentHeight <= 0) {
    return null
  }

  return currentHeight
}
