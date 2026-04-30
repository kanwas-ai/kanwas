import type { Editor, JSONContent } from '@tiptap/react'

export interface SerializedMention {
  id: string
  label: string
}

export interface SerializedEditor {
  message: string
  mentions: SerializedMention[]
}

export function serializeEditor(editor: Editor): SerializedEditor {
  const mentions: SerializedMention[] = []
  const seenIds = new Set<string>()

  function serializeNode(node: JSONContent): string {
    if (node.type === 'text') {
      let text = node.text || ''
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'bold') text = `**${text}**`
          else if (mark.type === 'italic') text = `*${text}*`
          else if (mark.type === 'code') text = `\`${text}\``
        }
      }
      return text
    }

    if (node.type === 'mention') {
      const id = node.attrs?.id
      const label = node.attrs?.label || ''
      if (id && !seenIds.has(id)) {
        seenIds.add(id)
        mentions.push({ id, label })
      }
      return `@${label}`
    }

    if (node.type === 'hardBreak') {
      return '\n'
    }

    if (node.type === 'paragraph' || node.type === 'doc') {
      return (node.content || []).map(serializeNode).join('')
    }

    // Fallback for unknown nodes
    if (node.content) {
      return node.content.map(serializeNode).join('')
    }

    return ''
  }

  const json = editor.getJSON()
  const message = (json.content || []).map(serializeNode).join('\n')

  return { message, mentions }
}
