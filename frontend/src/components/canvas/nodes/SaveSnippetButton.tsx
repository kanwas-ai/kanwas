// SaveSnippetButton.tsx

import { useBlockNoteEditor, useComponentsContext } from '@blocknote/react'
import { useSnippets } from '@/hooks/useSnippets'
import { useFitNodeInView } from '@/components/canvas/hooks'
import { Bookmark } from 'lucide-react'

interface SaveSnippetButtonProps {
  source?: string
}

export function SaveSnippetButton({ source }: SaveSnippetButtonProps) {
  const editor = useBlockNoteEditor()
  const Components = useComponentsContext()
  const { saveSnippet } = useSnippets()
  const fitNodeInView = useFitNodeInView()

  if (!Components) return null

  const handleClick = () => {
    const selection = editor.getSelection()
    let nodeId: string | undefined

    if (selection?.blocks.length) {
      nodeId = saveSnippet({ type: 'blocks', blocks: selection.blocks }, source)
    } else {
      const text = editor.getSelectedText()
      if (text) {
        nodeId = saveSnippet({ type: 'text', text }, source)
      }
    }

    if (nodeId) {
      setTimeout(() => fitNodeInView(nodeId!), 150)
    }
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button clip-to-doc-btn"
      label="Clip to document"
      mainTooltip="Clip to document"
      isSelected={false}
      onClick={handleClick}
      icon={<Bookmark size={18} />}
    />
  )
}
