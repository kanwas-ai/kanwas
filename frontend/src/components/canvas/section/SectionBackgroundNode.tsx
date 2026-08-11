import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { FONT_CSS } from '../nodes/nodeConstants'
import {
  SECTION_CONTENT_GAP,
  SECTION_DROP_ZONE_SCALE,
  SECTION_TITLE_FONT_FAMILY,
  SECTION_TITLE_FONT_SIZE,
  SECTION_TITLE_FONT_WEIGHT,
  SECTION_TITLE_HEIGHT,
} from './layout'

export interface SectionBackgroundData {
  title: string
  layout: 'horizontal' | 'grid'
  columns?: number
  isDropTarget?: boolean
  onTitleChange?: (sectionId: string, title: string) => void
  onLayoutChange?: (sectionId: string, layout: 'horizontal' | 'grid') => void
  onColumnsChange?: (sectionId: string, columns: number | undefined) => void
  onSectionDrag?: (sectionId: string, dx: number, dy: number) => void
  onSectionDragStart?: (sectionId: string) => void
  onSectionDragEnd?: (sectionId: string) => void
  onDeleteSection?: (sectionId: string) => void
}

function useSectionDrag(
  id: string,
  onSectionDrag: SectionBackgroundData['onSectionDrag'],
  onSectionDragStart: SectionBackgroundData['onSectionDragStart'],
  onSectionDragEnd: SectionBackgroundData['onSectionDragEnd'],
  getViewport: ReturnType<typeof useReactFlow>['getViewport']
) {
  const onSectionDragRef = useRef(onSectionDrag)
  onSectionDragRef.current = onSectionDrag
  const onSectionDragStartRef = useRef(onSectionDragStart)
  onSectionDragStartRef.current = onSectionDragStart
  const onSectionDragEndRef = useRef(onSectionDragEnd)
  onSectionDragEndRef.current = onSectionDragEnd
  const getViewportRef = useRef(getViewport)
  getViewportRef.current = getViewport

  return useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement
      if (target.closest('.nodrag') && !target.closest('[data-section-drag-handle]')) return

      event.preventDefault()

      let prevX = event.clientX
      let prevY = event.clientY

      const onMove = (pointerEvent: PointerEvent) => {
        const { zoom } = getViewportRef.current()
        const dx = (pointerEvent.clientX - prevX) / zoom
        const dy = (pointerEvent.clientY - prevY) / zoom
        prevX = pointerEvent.clientX
        prevY = pointerEvent.clientY
        onSectionDragRef.current?.(id, dx, dy)
      }

      const onUp = () => {
        document.body.style.cursor = ''
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        onSectionDragEndRef.current?.(id)
      }

      document.body.style.cursor = 'grabbing'
      onSectionDragStartRef.current?.(id)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [id]
  )
}

interface SectionBackgroundNodeProps {
  id: string
  data: SectionBackgroundData
}

export default memo(function SectionBackgroundNode({ id, data }: SectionBackgroundNodeProps) {
  const {
    title,
    layout,
    columns,
    isDropTarget = false,
    onTitleChange,
    onLayoutChange,
    onColumnsChange,
    onSectionDrag,
    onSectionDragStart,
    onSectionDragEnd,
    onDeleteSection,
  } = data
  const { getViewport } = useReactFlow()
  const titleEditorRef = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const handleSectionDragStart = useSectionDrag(id, onSectionDrag, onSectionDragStart, onSectionDragEnd, getViewport)
  const gridColumns = Math.max(1, columns ?? 2)

  useEffect(() => {
    if (!isEditing || !titleEditorRef.current) {
      return
    }

    titleEditorRef.current.textContent = title
    titleEditorRef.current.focus()
  }, [isEditing, title])

  const commitTitle = useCallback(() => {
    const nextTitle = titleEditorRef.current?.textContent?.trim() || ''
    if (!titleEditorRef.current) {
      return
    }

    if (!nextTitle) {
      titleEditorRef.current.textContent = title
      return
    }

    if (nextTitle && nextTitle !== title) {
      onTitleChange?.(id, nextTitle)
      titleEditorRef.current.textContent = nextTitle
      return
    }

    titleEditorRef.current.textContent = title
  }, [id, onTitleChange, title])

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleBlur = useCallback(() => {
    commitTitle()
    setIsEditing(false)
  }, [commitTitle])

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ')
    document.execCommand('insertText', false, text)
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        return
      }

      if (event.key === 'Escape') {
        if (titleEditorRef.current) {
          titleEditorRef.current.textContent = title
          titleEditorRef.current.blur()
        }
        setIsEditing(false)
      }
    },
    [title]
  )

  return (
    <div className="nopan relative h-full w-full" style={{ pointerEvents: 'none' }}>
      <div
        aria-hidden="true"
        className="absolute rounded-[34px] transition-opacity"
        style={{
          pointerEvents: 'none',
          top: `${-SECTION_DROP_ZONE_SCALE * 100}%`,
          right: `${-SECTION_DROP_ZONE_SCALE * 100}%`,
          bottom: `${-SECTION_DROP_ZONE_SCALE * 100}%`,
          left: `${-SECTION_DROP_ZONE_SCALE * 100}%`,
          boxShadow: 'inset 0 0 0 1.5px rgba(177, 169, 162, 0.35)',
          opacity: isDropTarget ? 1 : 0,
        }}
      />
      <div className="flex items-start" style={{ minHeight: SECTION_TITLE_HEIGHT, pointerEvents: 'auto' }}>
        <div className="relative inline-block">
          {isEditing ? (
            <div
              ref={titleEditorRef}
              contentEditable
              suppressContentEditableWarning
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className="nodrag nowheel inline-block min-w-[1ch] whitespace-nowrap outline-none text-[#B1A9A2]"
              style={{
                fontSize: SECTION_TITLE_FONT_SIZE,
                fontFamily: FONT_CSS.inter ?? SECTION_TITLE_FONT_FAMILY,
                fontWeight: SECTION_TITLE_FONT_WEIGHT,
                lineHeight: 1.05,
                cursor: 'text',
                userSelect: 'text',
              }}
            >
              {title}
            </div>
          ) : (
            <div
              onMouseDown={handleSectionDragStart}
              onDoubleClick={handleDoubleClick}
              className="inline-block min-w-[1ch] whitespace-nowrap outline-none text-[#B1A9A2] transition-[filter] hover:brightness-110"
              style={{
                fontSize: SECTION_TITLE_FONT_SIZE,
                fontFamily: FONT_CSS.inter ?? SECTION_TITLE_FONT_FAMILY,
                fontWeight: SECTION_TITLE_FONT_WEIGHT,
                lineHeight: 1.05,
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              {title}
            </div>
          )}

          <div className="nodrag pointer-events-auto absolute left-full top-0 ml-2 flex items-start pt-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-foreground-muted transition-all duration-150 hover:scale-105 hover:bg-block-highlight hover:text-foreground active:scale-95"
                  aria-label={`Section settings for ${title}`}
                >
                  <i className="fa-solid fa-ellipsis text-sm" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="nodrag z-[80] min-w-[180px] select-none rounded-lg border border-outline bg-canvas p-1 shadow-lg"
                  sideOffset={6}
                  align="end"
                >
                  <DropdownMenu.Item
                    className={`flex cursor-pointer select-none items-center gap-2 rounded px-3 py-2 text-sm outline-none ${
                      layout === 'horizontal'
                        ? 'bg-block-highlight text-foreground'
                        : 'text-foreground hover:bg-block-hover'
                    }`}
                    onSelect={() => onLayoutChange?.(id, 'horizontal')}
                  >
                    <i className="fa-solid fa-grip-lines text-[11px]" />
                    Row layout
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={`flex cursor-pointer select-none items-center gap-2 rounded px-3 py-2 text-sm outline-none ${
                      layout === 'grid' ? 'bg-block-highlight text-foreground' : 'text-foreground hover:bg-block-hover'
                    }`}
                    onSelect={() => onLayoutChange?.(id, 'grid')}
                  >
                    <i className="fa-solid fa-table-cells-large text-[11px]" />
                    Grid layout
                  </DropdownMenu.Item>
                  {layout === 'grid' && (
                    <>
                      <DropdownMenu.Separator className="my-1 h-px bg-outline" />
                      <div className="select-none px-3 py-2 text-xs text-foreground-muted">
                        <div className="mb-2 uppercase tracking-[0.16em]">Columns</div>
                        <div className="flex items-center gap-2">
                          {[1, 2, 3, 4].map((count) => (
                            <button
                              key={count}
                              type="button"
                              className={`cursor-pointer select-none rounded-md px-2 py-1 text-sm ${
                                gridColumns === count
                                  ? 'bg-foreground text-canvas'
                                  : 'bg-block-highlight text-foreground hover:bg-block-hover'
                              }`}
                              onClick={() => onColumnsChange?.(id, count)}
                            >
                              {count}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  <DropdownMenu.Separator className="my-1 h-px bg-outline" />
                  <DropdownMenu.Item
                    className="flex cursor-pointer select-none items-center gap-2 rounded px-3 py-2 text-sm text-red-500 outline-none hover:bg-block-hover"
                    onSelect={() => onDeleteSection?.(id)}
                  >
                    <i className="fa-solid fa-trash-can text-[11px]" />
                    Delete section
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
      <div aria-hidden="true" style={{ height: SECTION_CONTENT_GAP, pointerEvents: 'none' }} />
    </div>
  )
})
