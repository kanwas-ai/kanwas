import type { WorkspaceContentStore } from 'shared'
import type { NodeItem } from 'shared'
import * as Y from 'yjs'

export function extractPlainTextFromBlockNoteFragment(fragment: Y.XmlFragment): string {
  const texts: string[] = []

  const traverse = (node: Y.XmlElement | Y.XmlText | Y.XmlFragment | Y.AbstractType<unknown>) => {
    if (node instanceof Y.XmlText) {
      const text = node.toJSON()
      if (typeof text === 'string') {
        texts.push(text)
      }
      return
    }

    if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      for (const child of node.toArray()) {
        traverse(child as Y.XmlElement | Y.XmlText)
      }
    }
  }

  traverse(fragment)
  return texts.join(' ').replace(/\s+/g, ' ').trim()
}

export function getPlainTextFromNodeContent(node: NodeItem, contentStore: WorkspaceContentStore): string {
  if (node.xynode.type === 'blockNote' || node.xynode.type === 'stickyNote') {
    const fragment = contentStore.getBlockNoteFragment(node.id)
    return fragment ? extractPlainTextFromBlockNoteFragment(fragment) : ''
  }

  if (node.xynode.type === 'text') {
    return node.xynode.data.content
  }

  return ''
}
