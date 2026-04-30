import { memo, useRef, useState, useEffect, useCallback } from 'react'
import type { TextNode as TextNodeType } from 'shared'
import { useReactFlow } from '@xyflow/react'
import type { TextNodeData } from 'shared'
import type { WithCanvasData } from '../types'
import { NodeSideToolbar } from './NodeSideToolbar'
import { FONT_CSS } from './nodeConstants'
import { useNodeData, useFontChangeAll } from './useNodeData'
import { useDeleteNode } from '../hooks'
import { useWorkspace } from '@/providers/workspace'

type TextNodeProps = WithCanvasData<TextNodeType>

const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 200

export default memo(function TextNode({ id, data, selected }: TextNodeProps) {
  const { content, fontSize = 88, fontFamily = 'inter', color = '#B1A9A2' } = data
  const reactFlow = useReactFlow()
  const getNodeData = useNodeData<TextNodeData>(id, 'text')
  const handleFontChange = useFontChangeAll('text')
  const deleteNode = useDeleteNode()
  const { activeCanvasId } = useWorkspace()
  const editableRef = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const draggingRef = useRef(false)
  const cleanupResizeRef = useRef<(() => void) | null>(null)

  // Cleanup resize listeners on unmount
  useEffect(() => {
    return () => {
      cleanupResizeRef.current?.()
    }
  }, [])

  // Sync content from store to DOM when not editing
  useEffect(() => {
    if (!isEditing && editableRef.current && editableRef.current.textContent !== content) {
      editableRef.current.textContent = content
    }
  }, [content, isEditing])

  const commitContent = useCallback(() => {
    const newContent = editableRef.current?.textContent || ''
    if (newContent === content) return
    const nodeData = getNodeData()
    if (nodeData) nodeData.content = newContent
  }, [content, getNodeData])

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true)
    requestAnimationFrame(() => {
      editableRef.current?.focus()
    })
  }, [])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    const text = editableRef.current?.textContent?.trim() || ''
    if (!text && activeCanvasId) {
      deleteNode(id, activeCanvasId)
      return
    }
    commitContent()
  }, [commitContent, activeCanvasId, deleteNode, id])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEditing(false)
        commitContent()
        editableRef.current?.blur()
      }
    },
    [commitContent]
  )

  // Corner resize: drag to scale font size
  const handleResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      draggingRef.current = true

      const startY = e.clientY
      const startSize = fontSize
      const zoom = reactFlow.getViewport().zoom

      const handleMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return
        const dy = (ev.clientY - startY) / zoom
        // ~1px drag = ~0.5px font size change
        const newSize = Math.round(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, startSize + dy * 0.5)))
        const nodeData = getNodeData()
        if (nodeData) nodeData.fontSize = newSize
      }

      const handleUp = () => {
        draggingRef.current = false
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        cleanupResizeRef.current = null
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      cleanupResizeRef.current = handleUp
    },
    [fontSize, reactFlow, getNodeData]
  )

  return (
    <div
      className={`relative ${selected ? 'ring-1 ring-foreground/20 ring-offset-4 ring-offset-transparent rounded' : ''}`}
      style={{ minWidth: 40 }}
    >
      <div
        ref={editableRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onDoubleClick={handleDoubleClick}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={`outline-none whitespace-pre-wrap break-words ${isEditing ? 'nodrag nowheel' : ''}`}
        style={{
          fontSize,
          fontFamily: FONT_CSS[fontFamily] || FONT_CSS.inter,
          fontWeight: fontFamily === 'inter' ? 700 : undefined,
          color,
          lineHeight: 1.2,
          cursor: isEditing ? 'text' : 'default',
          userSelect: isEditing ? 'text' : 'none',
        }}
      >
        {content}
      </div>

      {/* Corner resize handle + side toolbar when selected */}
      {selected && !isEditing && (
        <>
          <div
            className="nodrag"
            onMouseDown={handleResizeDown}
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 16,
              height: 16,
              cursor: 'nwse-resize',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" style={{ opacity: 0.4 }}>
              <line
                x1="14"
                y1="4"
                x2="4"
                y2="14"
                stroke="var(--color-foreground)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="14"
                y1="9"
                x2="9"
                y2="14"
                stroke="var(--color-foreground)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <NodeSideToolbar fontFamily={fontFamily} onFontChange={handleFontChange} />
        </>
      )}
    </div>
  )
})
