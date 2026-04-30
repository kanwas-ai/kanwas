import { createExtension } from '@blocknote/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

interface DetachedAgentCursorOptions {
  name?: string
  color?: string
}

export interface DetachedAgentCursorAnchor {
  position: number
  blockId: string
  blockType: string
}

const detachedAgentCursorPluginKey = new PluginKey('detachedAgentCursor')
const DEFAULT_AGENT_NAME = 'Agent'
const DEFAULT_AGENT_COLOR = '#7c3aed'

interface NodePositionInfo {
  node: ProseMirrorNode
  beforePos: number
  afterPos: number
}

type DetachedBlockInfo =
  | {
      bnBlock: NodePositionInfo
      childContainer: NodePositionInfo
      isBlockContainer: false
    }
  | {
      bnBlock: NodePositionInfo
      blockContent: NodePositionInfo
      childContainer?: NodePositionInfo
      isBlockContainer: true
    }

function isDarkColor(backgroundColor: string): boolean {
  const color = backgroundColor.startsWith('#') ? backgroundColor.slice(1, 7) : backgroundColor
  const red = Number.parseInt(color.slice(0, 2), 16)
  const green = Number.parseInt(color.slice(2, 4), 16)
  const blue = Number.parseInt(color.slice(4, 6), 16)

  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return true
  }

  const linearChannels = [red, green, blue].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * linearChannels[0] + 0.7152 * linearChannels[1] + 0.0722 * linearChannels[2]

  return luminance <= 0.179
}

function renderDetachedAgentCursor(name: string, color: string, anchor: DetachedAgentCursorAnchor): HTMLElement {
  const cursorElement = document.createElement('span')
  cursorElement.classList.add('bn-collaboration-cursor__base', 'bn-detached-agent-cursor')
  cursorElement.setAttribute('data-active', '')
  cursorElement.dataset.detachedAgentPos = String(anchor.position)
  cursorElement.dataset.detachedAgentBlockId = anchor.blockId
  cursorElement.dataset.detachedAgentBlockType = anchor.blockType

  const textColor = isDarkColor(color) ? 'white' : 'black'

  const caretElement = document.createElement('span')
  caretElement.classList.add('bn-collaboration-cursor__caret')
  caretElement.setAttribute('contenteditable', 'false')
  caretElement.style.backgroundColor = color
  caretElement.style.color = textColor

  const labelElement = document.createElement('span')
  labelElement.classList.add('bn-collaboration-cursor__label')
  labelElement.style.backgroundColor = color
  labelElement.style.color = textColor
  labelElement.append(document.createTextNode(name))

  caretElement.append(labelElement)

  cursorElement.append(document.createTextNode('\u2060'))
  cursorElement.append(caretElement)
  cursorElement.append(document.createTextNode('\u2060'))

  return cursorElement
}

function getLastBlockInfo(doc: ProseMirrorNode): DetachedBlockInfo | null {
  const blockNodes: Array<{ node: ProseMirrorNode; posBeforeNode: number }> = []

  doc.descendants((node, pos) => {
    if (node.type.isInGroup('bnBlock')) {
      blockNodes.push({ node, posBeforeNode: pos })
    }
  })

  let shouldSkipTerminalEmptyParagraph = true

  for (let index = blockNodes.length - 1; index >= 0; index -= 1) {
    const info = getBlockInfoWithManualOffset(blockNodes[index].node, blockNodes[index].posBeforeNode)

    if (shouldSkipTerminalEmptyParagraph && isTerminalEmptyParagraphBlock(info)) {
      continue
    }

    shouldSkipTerminalEmptyParagraph = false

    if (resolveCursorAnchorFromBlockInfo(info) !== null) {
      return info
    }
  }

  return null
}

function getBlockInfoWithManualOffset(node: ProseMirrorNode, bnBlockBeforePosOffset: number): DetachedBlockInfo {
  const bnBlock: NodePositionInfo = {
    node,
    beforePos: bnBlockBeforePosOffset,
    afterPos: bnBlockBeforePosOffset + node.nodeSize,
  }

  if (node.type.name !== 'blockContainer') {
    return {
      bnBlock,
      childContainer: bnBlock,
      isBlockContainer: false,
    }
  }

  let blockContent: NodePositionInfo | undefined
  let childContainer: NodePositionInfo | undefined

  node.forEach((childNode, offset) => {
    const beforePos = bnBlockBeforePosOffset + offset + 1
    const childInfo: NodePositionInfo = {
      node: childNode,
      beforePos,
      afterPos: beforePos + childNode.nodeSize,
    }

    if (childNode.type.spec.group === 'blockContent') {
      blockContent = childInfo
    }

    if (childNode.type.name === 'blockGroup') {
      childContainer = childInfo
    }
  })

  if (!blockContent) {
    throw new Error(`blockContainer node is missing blockContent child: ${node.type.name}`)
  }

  return {
    bnBlock,
    blockContent,
    childContainer,
    isBlockContainer: true,
  }
}

function isTerminalEmptyParagraphBlock(info: DetachedBlockInfo): boolean {
  if (!info.isBlockContainer) {
    return false
  }

  if (info.blockContent.node.type.name !== 'paragraph') {
    return false
  }

  if (info.blockContent.node.content.size > 0) {
    return false
  }

  return !info.childContainer || info.childContainer.node.childCount === 0
}

function getTableCursorAnchor(tableNode: ProseMirrorNode, tableBeforePos: number): number | null {
  let lastParagraphStart: number | null = null
  let lastNonEmptyParagraphEnd: number | null = null

  tableNode.descendants((node, pos) => {
    if (node.type.name !== 'tableParagraph') {
      return true
    }

    const paragraphBeforePos = tableBeforePos + 1 + pos
    lastParagraphStart = paragraphBeforePos + 1

    if (node.content.size > 0) {
      lastNonEmptyParagraphEnd = paragraphBeforePos + 1 + node.content.size
    }

    return true
  })

  return lastNonEmptyParagraphEnd ?? lastParagraphStart
}

function resolveCursorAnchorFromBlockInfo(info: DetachedBlockInfo): DetachedAgentCursorAnchor | null {
  const nestedCursorAnchor = getCursorAnchorFromChildContainer(info.childContainer)
  if (nestedCursorAnchor !== null) {
    return nestedCursorAnchor
  }

  if (!info.isBlockContainer) {
    return null
  }

  const blockType = info.blockContent.node.type.name
  const blockId = info.bnBlock.node.attrs.id as string | undefined
  if (!blockId) {
    return null
  }

  if (blockType === 'table') {
    const tablePosition = getTableCursorAnchor(info.blockContent.node, info.blockContent.beforePos)
    if (tablePosition === null) {
      return null
    }

    return {
      position: tablePosition,
      blockId,
      blockType,
    }
  }

  if (info.blockContent.node.isTextblock || info.blockContent.node.type.spec.content === 'inline*') {
    return {
      position: info.blockContent.afterPos - 1,
      blockId,
      blockType,
    }
  }

  return null
}

function getCursorAnchorFromChildContainer(
  childContainer: NodePositionInfo | undefined
): DetachedAgentCursorAnchor | null {
  if (!childContainer || childContainer.node.childCount === 0) {
    return null
  }

  for (let index = childContainer.node.childCount - 1; index >= 0; index -= 1) {
    const childNode = childContainer.node.child(index)
    if (!childNode.type.isInGroup('bnBlock')) {
      continue
    }

    let childOffset = 0
    for (let siblingIndex = 0; siblingIndex < index; siblingIndex += 1) {
      childOffset += childContainer.node.child(siblingIndex).nodeSize
    }

    const childInfo = getBlockInfoWithManualOffset(childNode, childContainer.beforePos + 1 + childOffset)
    const cursorAnchor = resolveCursorAnchorFromBlockInfo(childInfo)
    if (cursorAnchor !== null) {
      return cursorAnchor
    }
  }

  return null
}

export function getDetachedAgentCursorAnchor(doc: ProseMirrorNode): DetachedAgentCursorAnchor | null {
  const lastBlockInfo = getLastBlockInfo(doc)
  if (!lastBlockInfo) {
    return null
  }

  return resolveCursorAnchorFromBlockInfo(lastBlockInfo)
}

export function getDetachedAgentCursorPosition(doc: ProseMirrorNode): number | null {
  return getDetachedAgentCursorAnchor(doc)?.position ?? null
}

export function createDetachedAgentCursorExtension(options: DetachedAgentCursorOptions = {}) {
  const name = options.name?.trim() || DEFAULT_AGENT_NAME
  const color = options.color || DEFAULT_AGENT_COLOR

  return createExtension({
    key: 'detachedAgentCursor',
    prosemirrorPlugins: [
      new Plugin({
        key: detachedAgentCursorPluginKey,
        props: {
          decorations(state) {
            const cursorAnchor = getDetachedAgentCursorAnchor(state.doc)
            if (cursorAnchor === null) {
              return DecorationSet.empty
            }

            const cursorDecoration = Decoration.widget(
              cursorAnchor.position,
              () => renderDetachedAgentCursor(name, color, cursorAnchor),
              {
                side: -1,
              }
            )

            return DecorationSet.create(state.doc, [cursorDecoration])
          },
        },
      }),
    ],
  })
}
