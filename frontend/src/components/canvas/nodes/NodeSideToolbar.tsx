import { memo, useState, useRef, useEffect, useLayoutEffect, useCallback, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import type { NodeFontFamily } from 'shared'
import { NODE_FONTS, FONT_KEYS, STICKY_COLOR_SWATCHES } from './nodeConstants'

type PanelMode = null | 'color' | 'font'

// ============================================================================
// PRIMITIVES
// ============================================================================

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
    className="w-7 h-7 rounded-lg flex items-center justify-center bg-toolbar-surface hover:bg-toolbar-surface border border-outline/50 transition-colors cursor-pointer select-none"
    title={title}
  >
    {children}
  </button>
))

// ============================================================================
// FLOATING PANEL
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

  useLayoutEffect(() => {
    if (!anchorRef.current) return
    const anchorRect = anchorRef.current.getBoundingClientRect()
    setPos({ top: anchorRect.bottom + 4, left: anchorRect.left })
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!panelRef.current || !pos) return
    const panelRect = panelRef.current.getBoundingClientRect()
    if (panelRect.bottom > window.innerHeight - 8) {
      const anchorRect = anchorRef.current?.getBoundingClientRect()
      if (anchorRect) {
        setPos({ top: anchorRect.top - panelRect.height - 4, left: pos.left })
      }
    }
  }, [pos, anchorRef])

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
      className="fixed z-[9999] bg-toolbar-surface border border-outline rounded-xl shadow-lg"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  )
}

// ============================================================================
// PANELS
// ============================================================================

function FontPanel({ current, onSelect }: { current: NodeFontFamily; onSelect: (font: NodeFontFamily) => void }) {
  return (
    <div className="flex flex-col gap-1 p-2">
      {FONT_KEYS.map((key) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`px-3 py-1.5 rounded-lg text-left text-sm transition-colors select-none ${
            current === key ? 'bg-foreground text-canvas' : 'hover:bg-block-highlight text-foreground'
          }`}
          style={{ fontFamily: NODE_FONTS[key].css }}
        >
          {NODE_FONTS[key].label}
        </button>
      ))}
    </div>
  )
}

function ColorPanel({ current, onSelect }: { current: string; onSelect: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-2" style={{ width: 160 }}>
      {STICKY_COLOR_SWATCHES.map(({ key, bg }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 active:scale-95 ${
            current === key ? 'border-foreground ring-1 ring-foreground/20' : 'border-transparent'
          }`}
          style={{ background: bg }}
          title={key}
        />
      ))}
    </div>
  )
}

// ============================================================================
// TOOLBAR
// ============================================================================

interface NodeSideToolbarProps {
  fontFamily: NodeFontFamily
  onFontChange: (font: NodeFontFamily) => void
  stickyColor?: {
    current: string
    onChange: (color: string) => void
  }
}

export const NodeSideToolbar = memo(function NodeSideToolbar({
  fontFamily,
  onFontChange,
  stickyColor,
}: NodeSideToolbarProps) {
  const [panelMode, setPanelMode] = useState<PanelMode>(null)
  const fontBtnRef = useRef<HTMLButtonElement>(null)
  const colorBtnRef = useRef<HTMLButtonElement>(null)

  const handleFontSelect = useCallback(
    (font: NodeFontFamily) => {
      onFontChange(font)
      setPanelMode(null)
    },
    [onFontChange]
  )

  const handleColorSelect = useCallback(
    (color: string) => {
      stickyColor?.onChange(color)
      setPanelMode(null)
    },
    [stickyColor]
  )

  return (
    <div
      className="nodrag nowheel absolute flex flex-col gap-1 select-none"
      style={{ top: 0, left: '100%', marginLeft: 8 }}
    >
      {stickyColor && (
        <ToolbarButton
          ref={colorBtnRef}
          title="Color"
          onClick={() => setPanelMode(panelMode === 'color' ? null : 'color')}
        >
          <span
            className="w-4 h-4 rounded"
            style={{
              background: STICKY_COLOR_SWATCHES.find((s) => s.key === stickyColor.current)?.bg ?? '#fef9c3',
            }}
          />
        </ToolbarButton>
      )}

      <ToolbarButton ref={fontBtnRef} title="Font" onClick={() => setPanelMode(panelMode === 'font' ? null : 'font')}>
        <span
          className="text-[13px] font-semibold text-foreground-muted"
          style={{ fontFamily: NODE_FONTS[fontFamily].css }}
        >
          Aa
        </span>
      </ToolbarButton>

      {panelMode === 'color' && stickyColor && (
        <FloatingPanel anchorRef={colorBtnRef} onClose={() => setPanelMode(null)}>
          <ColorPanel current={stickyColor.current} onSelect={handleColorSelect} />
        </FloatingPanel>
      )}

      {panelMode === 'font' && (
        <FloatingPanel anchorRef={fontBtnRef} onClose={() => setPanelMode(null)}>
          <FontPanel current={fontFamily} onSelect={handleFontSelect} />
        </FloatingPanel>
      )}
    </div>
  )
})
