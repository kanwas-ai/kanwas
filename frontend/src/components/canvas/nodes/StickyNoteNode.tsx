import { memo, useCallback, useEffect } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import type { StickyNoteNode as StickyNoteNodeType, NodeFontFamily } from 'shared'
import type { StickyNoteNodeData } from 'shared'
import type { WithCanvasData } from '../types'
import { NodeSideToolbar } from './NodeSideToolbar'
import { FONT_CSS } from './nodeConstants'
import { useNodeData, useFontChangeAll } from './useNodeData'
import { useCanvasCursorSuppressionWhileEditorFocused } from '@/hooks/useCanvasCursorSuppression'
import { useBlockNoteCollaborationUserInfo } from '@/hooks/useBlockNoteCollaborationUserInfo'
import { useNoteBlockNoteBinding } from '@/hooks/useNoteBlockNoteBinding'
import { type BlockNoteCollaborationProvider } from '@/lib/blocknote-collaboration'
import { useSetEditor, useRemoveEditor } from '@/providers/project-state'
import { useWorkspace } from '@/providers/workspace'
import { blockNoteSchema } from '@/lib/blocknote-schema'
import { BlockNoteEditorErrorBoundary } from '@/components/note-editors/BlockNoteEditorErrorBoundary'
import * as Y from 'yjs'

type StickyNoteNodeProps = WithCanvasData<StickyNoteNodeType>

// Two-stop linear gradient colors (light → darker same-hue pastel).
// Applied as `linear-gradient(135deg, from 0%, to 100%)`.
const STICKY_COLORS: Record<string, { from: string; to: string; text: string }> = {
  yellow: { from: '#FFF5C9', to: '#F7E37A', text: '#1a1a1a' },
  pink: { from: '#FFD7E8', to: '#FBA8CC', text: '#1a1a1a' },
  green: { from: '#D5F0DC', to: '#9ED6A9', text: '#1a1a1a' },
  blue: { from: '#D7E2FF', to: '#A8BEF0', text: '#1a1a1a' },
  orange: { from: '#FFDBC9', to: '#FFC6AA', text: '#1a1a1a' },
  purple: { from: '#D0C6FF', to: '#A596F0', text: '#1a1a1a' },
  beige: { from: '#F4E4CC', to: '#E5C898', text: '#1a1a1a' },
  coral: { from: '#FFD1C2', to: '#FDA892', text: '#1a1a1a' },
  teal: { from: '#C8EEDD', to: '#8AD5B4', text: '#1a1a1a' },
  burgundy: { from: '#F7C9C9', to: '#E79797', text: '#1a1a1a' },
}

function StickyNoteEditorInner({
  nodeId,
  fragment,
  provider,
  undoManager,
  fontFamily,
}: {
  nodeId: string
  fragment: Y.XmlFragment
  provider: BlockNoteCollaborationProvider
  undoManager: Y.UndoManager
  fontFamily: NodeFontFamily
}) {
  const setEditor = useSetEditor()
  const removeEditor = useRemoveEditor()
  const { localUser, workspaceUndoController } = useWorkspace()

  const editor = useCreateBlockNote({
    schema: blockNoteSchema,
    collaboration: {
      provider,
      fragment,
      user: {
        name: localUser.name,
        color: localUser.color,
      },
      undoManager,
    },
    _tiptapOptions: {
      editorProps: {
        handleKeyDown: (_view, event) => {
          const isModKey = event.metaKey || event.ctrlKey
          if (!isModKey || event.altKey || event.key.toLowerCase() !== 'z') {
            return false
          }

          event.preventDefault()

          if (event.shiftKey) {
            workspaceUndoController.redo()
          } else {
            workspaceUndoController.undo()
          }

          return true
        },
      },
    },
  })

  useBlockNoteCollaborationUserInfo(editor, localUser)
  useCanvasCursorSuppressionWhileEditorFocused(editor)

  useEffect(() => {
    setEditor(nodeId, editor as never)
    return () => {
      removeEditor(nodeId)
    }
  }, [editor, nodeId, setEditor, removeEditor])

  return (
    <div
      className="nodrag sticky-note-editor"
      style={{ '--sticky-font': FONT_CSS[fontFamily] || FONT_CSS.inter } as React.CSSProperties}
    >
      <BlockNoteView
        editor={editor as never}
        theme="light"
        sideMenu={false}
        slashMenu={false}
        formattingToolbar={false}
      />
    </div>
  )
}

function StickyNoteEditor({ nodeId, fontFamily }: { nodeId: string; fontFamily: NodeFontFamily }) {
  const { fragment, editorKey, collaborationProvider, undoManager } = useNoteBlockNoteBinding(nodeId)

  if (!fragment) return null

  return (
    <BlockNoteEditorErrorBoundary fragmentKey={editorKey}>
      <StickyNoteEditorInner
        key={editorKey}
        nodeId={nodeId}
        fragment={fragment}
        provider={collaborationProvider}
        undoManager={undoManager}
        fontFamily={fontFamily}
      />
    </BlockNoteEditorErrorBoundary>
  )
}

export default memo(function StickyNoteNode({ id, data, selected }: StickyNoteNodeProps) {
  const { color = 'yellow', fontFamily = 'inter' } = data

  const colors = STICKY_COLORS[color] || STICKY_COLORS.yellow
  const getNodeData = useNodeData<StickyNoteNodeData>(id, 'stickyNote')
  const handleFontChange = useFontChangeAll('stickyNote')

  const handleColorChange = useCallback(
    (newColor: string) => {
      const nodeData = getNodeData()
      if (nodeData) nodeData.color = newColor as StickyNoteNodeData['color']
    },
    [getNodeData]
  )

  return (
    <div className="relative" style={{ width: 240 }}>
      {/* Tape strip — lighter, washi-style variant of the sticky's end color.
          Centered vertically across the sticky's top edge (equal overhang above/below). */}
      <div
        style={{
          position: 'absolute',
          top: -12,
          left: '50%',
          transform: 'translateX(-50%) rotate(-2deg)',
          width: 56,
          height: 30,
          background: `color-mix(in srgb, ${colors.to} 90%, #000 10%)`,
          opacity: 0.6,
          borderRadius: 2,
          zIndex: 1,
        }}
      />

      {/* Sticky note body */}
      <div
        style={
          {
            'display': 'flex',
            'flexDirection': 'column',
            'background': `linear-gradient(135deg, ${colors.from} -25%, ${colors.to} 100%)`,
            'border': '1px solid #ffffff',
            'borderRadius': 20,
            'padding': '28px 12px 12px',
            'minHeight': 240,
            'position': 'relative',
            'boxShadow': selected ? '0 4px 20px 0 rgba(0, 0, 0, 0.15)' : 'none',
            'transition': 'box-shadow 120ms ease-out',
            'color': colors.text,
            '--sticky-text-color': colors.text,
            'fontSize': 32,
            'lineHeight': 1.15,
          } as React.CSSProperties
        }
      >
        <StickyNoteEditor nodeId={id} fontFamily={fontFamily} />
      </div>

      {/* Side toolbar when selected */}
      {selected && (
        <NodeSideToolbar
          fontFamily={fontFamily}
          onFontChange={handleFontChange}
          stickyColor={{ current: color, onChange: handleColorChange }}
        />
      )}
    </div>
  )
})
