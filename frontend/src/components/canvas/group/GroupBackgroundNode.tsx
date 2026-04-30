import { memo, useState, useRef, useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { GROUP_LAYOUT } from 'shared/constants'
import { InlineInput } from '@/components/ui/InlineInput'
import { GroupToolbar } from './GroupToolbar'

export interface GroupBackgroundData {
  name: string
  color?: string
  isJoinTarget?: boolean
  onColorChange?: (groupId: string, color: string | undefined) => void
  onColumnsChange?: (groupId: string, columns: number | undefined) => void
  onGroupDrag?: (groupId: string, dx: number, dy: number) => void
  onNameChange?: (groupId: string, name: string) => void
  memberCount?: number
  columns?: number
}

interface GroupBackgroundNodeProps {
  id: string
  selected?: boolean
  data: GroupBackgroundData
}

/** Custom drag that bypasses ReactFlow so group bg + members update in the same Valtio→render cycle. */
function useGroupBgDrag(
  id: string,
  onGroupDrag: GroupBackgroundData['onGroupDrag'],
  getViewport: ReturnType<typeof useReactFlow>['getViewport']
) {
  const onGroupDragRef = useRef(onGroupDrag)
  onGroupDragRef.current = onGroupDrag
  const getViewportRef = useRef(getViewport)
  getViewportRef.current = getViewport

  return useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest('.nodrag')) return

      let prevX = e.clientX
      let prevY = e.clientY
      let isDragging = false

      const onMove = (ev: PointerEvent) => {
        if (!isDragging) {
          if (Math.abs(ev.clientX - prevX) + Math.abs(ev.clientY - prevY) < 3) return
          isDragging = true
          document.body.style.cursor = 'grabbing'
        }
        const { zoom } = getViewportRef.current()
        const dx = (ev.clientX - prevX) / zoom
        const dy = (ev.clientY - prevY) / zoom
        prevX = ev.clientX
        prevY = ev.clientY
        onGroupDragRef.current?.(id, dx, dy)
      }

      const onUp = () => {
        document.body.style.cursor = ''
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [id]
  )
}

export default memo(function GroupBackgroundNode({ id, selected, data }: GroupBackgroundNodeProps) {
  const { name, color, isJoinTarget, onColorChange, onColumnsChange, onGroupDrag, onNameChange, memberCount, columns } =
    data
  const { getViewport } = useReactFlow()
  const handleMouseDown = useGroupBgDrag(id, onGroupDrag, getViewport)
  const [isEditing, setIsEditing] = useState(false)

  const bgStyle: React.CSSProperties = color ? { backgroundColor: `${color}18`, borderColor: `${color}40` } : {}

  const handleRename = useCallback(
    (newName: string) => {
      if (newName !== name && newName.trim()) {
        onNameChange?.(id, newName.trim())
      }
      setIsEditing(false)
    },
    [id, name, onNameChange]
  )

  return (
    <div
      style={{ width: '100%', height: '100%', cursor: isJoinTarget ? undefined : 'grab' }}
      className="nopan"
      onMouseDown={isJoinTarget ? undefined : handleMouseDown}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Label above the bordered group area, matching other node labels */}
      <div className="px-3 flex items-center gap-1.5 select-none" style={{ height: `${GROUP_LAYOUT.LABEL_HEIGHT}px` }}>
        {isEditing ? (
          <div className="nodrag nopan flex-1" style={{ maxWidth: 240 }}>
            <InlineInput
              value={name}
              onSave={handleRename}
              onCancel={() => setIsEditing(false)}
              placeholder="Group name..."
            />
          </div>
        ) : (
          <>
            <span
              className={`truncate text-sm font-medium ${
                onNameChange
                  ? 'text-document-name cursor-pointer hover:text-foreground transition-colors'
                  : 'text-foreground-muted'
              }`}
              onDoubleClick={onNameChange ? () => setIsEditing(true) : undefined}
            >
              {name}
            </span>
            {isJoinTarget && (
              <span className="text-xs text-card-border-accent font-medium shrink-0">
                <i className="fa-solid fa-plus mr-1" />
                Add to group
              </span>
            )}
          </>
        )}
      </div>

      {/* Bordered group background */}
      <div
        className={`group/groupbg relative rounded-2xl nopan transition-colors duration-150 ${
          isJoinTarget
            ? 'border-[3px] border-card-border-accent border-dashed bg-card-border-accent/10'
            : color
              ? 'border-2'
              : 'border-2 border-transparent hover:border-dashed hover:border-outline/50'
        } ${selected ? 'border-primary-button-background/60' : ''}`}
        style={{
          width: '100%',
          height: `calc(100% - ${GROUP_LAYOUT.LABEL_HEIGHT}px)`,
          ...(!isJoinTarget ? bgStyle : {}),
        }}
      >
        {!isJoinTarget && (
          <GroupToolbar
            groupId={id}
            color={color}
            columns={columns}
            memberCount={memberCount ?? 0}
            onColorChange={onColorChange}
            onColumnsChange={onColumnsChange}
          />
        )}
      </div>
    </div>
  )
})
