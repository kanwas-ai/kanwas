import { memo, useState, useRef, useEffect, useLayoutEffect, useCallback, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import type { NodeFontFamily } from 'shared'
import { NODE_FONTS, FONT_KEYS, STICKY_COLOR_SWATCHES, TEXT_SIZE_PRESETS, TEXT_COLOR_SWATCHES } from './nodeConstants'

type PanelMode = null | 'color' | 'font' | 'textSize' | 'textColor'

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

// Generalized swatch grid: `value` is what gets compared against `current` and passed to
// `onSelect` (a color key for sticky notes, a raw CSS color string for text nodes); `render`
// is the CSS `background` value drawn on the swatch (a gradient for sticky, a flat hex for text).
type SwatchItem = { key: string; render: string; value: string }

function SwatchPanel({
  items,
  current,
  onSelect,
}: {
  items: SwatchItem[]
  current: string
  onSelect: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 p-2" style={{ width: 160 }}>
      {items.map(({ key, render, value }) => (
        <button
          key={key}
          onClick={() => onSelect(value)}
          className={`w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 active:scale-95 ${
            current === value ? 'border-foreground ring-1 ring-foreground/20' : 'border-transparent'
          }`}
          style={{ background: render }}
          title={key}
        />
      ))}
    </div>
  )
}

// Sticky notes select by color *key* (e.g. 'yellow'); the swatch itself renders the gradient.
const STICKY_SWATCH_ITEMS: SwatchItem[] = STICKY_COLOR_SWATCHES.map(({ key, bg }) => ({
  key,
  render: bg,
  value: key,
}))

// Text nodes select by raw CSS color value; the swatch renders that flat color directly.
const TEXT_SWATCH_ITEMS: SwatchItem[] = TEXT_COLOR_SWATCHES.map(({ key, color }) => ({
  key,
  render: color,
  value: color,
}))

function TextSizePanel({ current, onSelect }: { current: number; onSelect: (fontSize: number) => void }) {
  const activeKey = TEXT_SIZE_PRESETS.reduce((closest, preset) =>
    Math.abs(preset.fontSize - current) < Math.abs(closest.fontSize - current) ? preset : closest
  ).key

  return (
    <div className="flex flex-col gap-1 p-2">
      {TEXT_SIZE_PRESETS.map((preset, i) => (
        <button
          key={preset.key}
          onClick={() => onSelect(preset.fontSize)}
          className={`px-3 py-1.5 rounded-lg text-left transition-colors select-none whitespace-nowrap ${
            activeKey === preset.key ? 'bg-foreground text-canvas' : 'hover:bg-block-highlight text-foreground'
          }`}
          // Hint at relative scale (12→18px) — NOT the preset's actual fontSize (44–220px).
          style={{ fontSize: 12 + (6 * i) / (TEXT_SIZE_PRESETS.length - 1) }}
        >
          {preset.label}
        </button>
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
  textSize?: {
    current: number
    onChange: (fontSize: number) => void
  }
  textColor?: {
    current: string
    onChange: (color: string) => void
  }
}

export const NodeSideToolbar = memo(function NodeSideToolbar({
  fontFamily,
  onFontChange,
  stickyColor,
  textSize,
  textColor,
}: NodeSideToolbarProps) {
  const [panelMode, setPanelMode] = useState<PanelMode>(null)
  const fontBtnRef = useRef<HTMLButtonElement>(null)
  const colorBtnRef = useRef<HTMLButtonElement>(null)
  const sizeBtnRef = useRef<HTMLButtonElement>(null)
  const textColorBtnRef = useRef<HTMLButtonElement>(null)

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

  const handleTextColorSelect = useCallback(
    (color: string) => {
      textColor?.onChange(color)
      setPanelMode(null)
    },
    [textColor]
  )

  const handleSizeSelect = useCallback(
    (fontSize: number) => {
      textSize?.onChange(fontSize)
      setPanelMode(null)
    },
    [textSize]
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

      {textColor && (
        <ToolbarButton
          ref={textColorBtnRef}
          title="Color"
          onClick={() => setPanelMode(panelMode === 'textColor' ? null : 'textColor')}
        >
          <span className="w-4 h-4 rounded" style={{ background: textColor.current || TEXT_COLOR_SWATCHES[0].color }} />
        </ToolbarButton>
      )}

      {textSize && (
        <ToolbarButton
          ref={sizeBtnRef}
          title="Size"
          onClick={() => setPanelMode(panelMode === 'textSize' ? null : 'textSize')}
        >
          <span className="flex items-baseline gap-px leading-none text-foreground-muted">
            <span className="text-[9px] font-semibold">T</span>
            <span className="text-[16px] font-semibold">T</span>
          </span>
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
          <SwatchPanel items={STICKY_SWATCH_ITEMS} current={stickyColor.current} onSelect={handleColorSelect} />
        </FloatingPanel>
      )}

      {panelMode === 'textColor' && textColor && (
        <FloatingPanel anchorRef={textColorBtnRef} onClose={() => setPanelMode(null)}>
          <SwatchPanel items={TEXT_SWATCH_ITEMS} current={textColor.current} onSelect={handleTextColorSelect} />
        </FloatingPanel>
      )}

      {panelMode === 'textSize' && textSize && (
        <FloatingPanel anchorRef={sizeBtnRef} onClose={() => setPanelMode(null)}>
          <TextSizePanel current={textSize.current} onSelect={handleSizeSelect} />
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
