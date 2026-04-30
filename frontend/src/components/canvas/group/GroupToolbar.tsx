import { forwardRef, useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { GROUP_LAYOUT } from 'shared/constants'
import type { GroupBackgroundData } from './GroupBackgroundNode'

type PanelMode = null | 'color' | 'grid'

// ============================================================================
// CONSTANTS
// ============================================================================

const PRESET_COLORS = [
  '#3B3B3B',
  '#6B7280',
  '#EF4444',
  '#EC4899',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#06B6D4',
  '#3B82F6',
  '#8B5CF6',
]

const GRID_PRESETS = [
  { label: '2×2', columns: 2 },
  { label: '3×3', columns: 3 },
]

// ============================================================================
// PRIMITIVES
// ============================================================================

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`w-9 h-8 rounded-lg flex items-center justify-center transition-colors ${
        active ? 'bg-foreground text-canvas' : 'bg-block-highlight text-foreground-muted hover:text-foreground'
      }`}
      title={title}
    >
      {children}
    </button>
  )
}

function GridInput({
  label,
  value,
  onChange,
  onKeyDown,
  onBlur,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  onBlur?: () => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-foreground-muted">{label}</span>
      <input
        type="number"
        min={1}
        max={20}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className="w-14 px-1.5 py-1 rounded-md text-xs text-center bg-block-highlight text-foreground border border-outline focus:border-primary-button-background outline-none"
      />
    </div>
  )
}

const ToolbarButton = forwardRef<
  HTMLButtonElement,
  {
    title: string
    onClick: () => void
    children: React.ReactNode
  }
>(({ title, onClick, children }, ref) => (
  <button
    ref={ref}
    onClick={(e) => {
      e.stopPropagation()
      onClick()
    }}
    className="w-7 h-7 rounded-lg flex items-center justify-center bg-editor/80 hover:bg-editor border border-outline/50 transition-colors cursor-pointer"
    title={title}
  >
    {children}
  </button>
))

// ============================================================================
// PANELS
// ============================================================================

function ColorPanel({ current, onSelect }: { current?: string; onSelect: (color: string | undefined) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-2" style={{ width: 200 }}>
      <button
        onClick={() => onSelect(undefined)}
        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ${
          !current ? 'border-foreground' : 'border-outline'
        }`}
        title="No color"
      >
        <i className="fa-solid fa-xmark text-[9px] text-foreground-muted" />
      </button>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onSelect(c)}
          className={`w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 active:scale-95 ${
            current === c ? 'border-foreground ring-1 ring-foreground/20' : 'border-transparent'
          }`}
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}
    </div>
  )
}

function GridPanel({
  currentColumns,
  memberCount,
  onSelect,
}: {
  currentColumns?: number
  memberCount: number
  onSelect: (columns: number | undefined) => void
}) {
  const cols = currentColumns ?? GROUP_LAYOUT.COLUMNS
  const rows = Math.max(1, Math.ceil(memberCount / cols))
  const [customRows, setCustomRows] = useState(String(rows))
  const [customCols, setCustomCols] = useState(String(cols))

  const applyCustom = () => {
    const c = parseInt(customCols, 10)
    if (c > 0 && c <= 20) onSelect(c)
  }

  const effectiveColumns = currentColumns === GROUP_LAYOUT.HORIZONTAL_COLUMNS ? memberCount : currentColumns
  const isVertical = currentColumns === 1
  const isHorizontal = currentColumns === GROUP_LAYOUT.HORIZONTAL_COLUMNS

  return (
    <div className="flex flex-col gap-2 p-2.5" style={{ width: 210 }}>
      <div className="flex flex-wrap gap-1.5">
        <ToggleButton active={isVertical} onClick={() => onSelect(1)} title="1 column">
          <i className="fa-solid fa-arrow-up-arrow-down text-[13px]" />
        </ToggleButton>
        <ToggleButton active={isHorizontal} onClick={() => onSelect(GROUP_LAYOUT.HORIZONTAL_COLUMNS)} title="1 row">
          <i className="fa-solid fa-left-right text-[13px]" />
        </ToggleButton>
        {GRID_PRESETS.map((p) => (
          <ToggleButton
            key={p.label}
            active={!isVertical && !isHorizontal && effectiveColumns === p.columns}
            onClick={() => onSelect(p.columns)}
            title={p.label}
          >
            <span className="text-xs font-semibold">{p.label}</span>
          </ToggleButton>
        ))}
      </div>
      <div className="flex gap-3 border-t border-outline pt-2">
        <GridInput
          label="Rows"
          value={customRows}
          onChange={(v) => {
            setCustomRows(v)
            const r = parseInt(v, 10)
            if (r > 0 && memberCount > 0) {
              const c = Math.ceil(memberCount / r)
              setCustomCols(String(c))
              onSelect(c)
            }
          }}
        />
        <GridInput
          label="Cols"
          value={customCols}
          onChange={(v) => {
            setCustomCols(v)
            const c = parseInt(v, 10)
            if (c > 0) {
              setCustomRows(String(Math.max(1, Math.ceil(memberCount / c))))
              onSelect(c)
            }
          }}
          onKeyDown={(e) => e.key === 'Enter' && applyCustom()}
          onBlur={applyCustom}
        />
      </div>
    </div>
  )
}

// ============================================================================
// FLOATING PANEL (portal-based positioning)
// ============================================================================

function FloatingPanel({
  anchorRef,
  children,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>
  children: React.ReactNode
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
  }, [anchorRef])

  // Flip above anchor if overflowing viewport bottom
  useEffect(() => {
    if (!panelRef.current || !pos) return
    const panelRect = panelRef.current.getBoundingClientRect()
    if (panelRect.bottom > window.innerHeight - 8) {
      const anchorRect = anchorRef.current?.getBoundingClientRect()
      if (anchorRect) {
        setPos({ top: anchorRect.top - panelRect.height - 4, left: pos.left })
      }
    }
  }, [pos, anchorRef])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  if (!pos) return null

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9999] bg-editor border border-outline rounded-xl shadow-lg"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  )
}

// ============================================================================
// TOOLBAR
// ============================================================================

export function GroupToolbar({
  groupId,
  color,
  columns,
  memberCount,
  onColorChange,
  onColumnsChange,
}: {
  groupId: string
  color?: string
  columns?: number
  memberCount: number
  onColorChange?: GroupBackgroundData['onColorChange']
  onColumnsChange?: GroupBackgroundData['onColumnsChange']
}) {
  const [panelMode, setPanelMode] = useState<PanelMode>(null)
  const colorBtnRef = useRef<HTMLButtonElement>(null)
  const gridBtnRef = useRef<HTMLButtonElement>(null)

  const handleColorSelect = useCallback(
    (c: string | undefined) => {
      onColorChange?.(groupId, c)
      setPanelMode(null)
    },
    [groupId, onColorChange]
  )

  const handleColumnsSelect = useCallback(
    (c: number | undefined) => {
      onColumnsChange?.(groupId, c)
    },
    [groupId, onColumnsChange]
  )

  return (
    <div
      className="nodrag nopan absolute flex flex-col gap-1 opacity-0 group-hover/groupbg:opacity-100 transition-opacity"
      style={{ top: 0, left: '100%', marginLeft: 6 }}
    >
      <ToolbarButton
        ref={colorBtnRef}
        title="Group color"
        onClick={() => setPanelMode(panelMode === 'color' ? null : 'color')}
      >
        {color ? (
          <span className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
        ) : (
          <i className="fa-solid fa-palette text-[13px] text-foreground-muted" />
        )}
      </ToolbarButton>

      <ToolbarButton
        ref={gridBtnRef}
        title="Grid layout"
        onClick={() => setPanelMode(panelMode === 'grid' ? null : 'grid')}
      >
        <i className="fa-solid fa-table-cells text-[13px] text-foreground-muted" />
      </ToolbarButton>

      {panelMode === 'color' && (
        <FloatingPanel anchorRef={colorBtnRef} onClose={() => setPanelMode(null)}>
          <ColorPanel current={color} onSelect={handleColorSelect} />
        </FloatingPanel>
      )}

      {panelMode === 'grid' && (
        <FloatingPanel anchorRef={gridBtnRef} onClose={() => setPanelMode(null)}>
          <GridPanel currentColumns={columns} memberCount={memberCount} onSelect={handleColumnsSelect} />
        </FloatingPanel>
      )}
    </div>
  )
}
