import { memo } from 'react'
import type { CSSProperties } from 'react'
import type { CanvasXyNode } from 'shared'
import { getCanvasIconClassName } from '@/components/sidebar/explorer/sidebar-icons'
import type { FolderPeekKind, WithCanvasData } from '../types'
import { FOLDER_CARD_HEIGHT, FOLDER_CARD_HEIGHT_EMPTY, FOLDER_CARD_WIDTH } from '../canvasFitView'

type CanvasNodeProps = WithCanvasData<CanvasXyNode>

const SHELF_TILE_LIMIT = 3
const SHELF_TILE_WIDTH = 57
const SHELF_TILE_HEIGHT = 52

// Horizontal padding is 17px, not the 18px the design spec names, because the card is
// `box-border` with a 1px token border on each side: 288 - (17 * 2) - 2 = 252, which is exactly
// the shelf's width (4 tiles * 57 + 3 gaps * 8). At 18px the content box is 250 and the
// four-tile row — whose tiles are `flex: none` — overflows the padding edge by 2px.
const CARD_PADDING_X = 17

// Filled-state vertical math: 16px * 2 padding + 22px header + 12px gap + 52px shelf = 118.
const FILLED_PADDING = `16px ${CARD_PADDING_X}px`
const FILLED_GAP = 12

// Empty-state vertical math: 12px * 2 padding + 22px header + 6px gap + 16px "Empty" line = 68.
// (See the header comment on canvasFitView.ts's FOLDER_CARD_HEIGHT_EMPTY for why this differs
// from the filled padding — a 12.5px font needs a 16px line-height to avoid clipping, so the
// vertical padding is tightened from 16px to 12px to make the fixed 68px height land exactly.)
const EMPTY_PADDING = `12px ${CARD_PADDING_X}px`
const EMPTY_GAP = 6

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  height: 22,
}

// Fixed 20px slot rather than the glyph's natural advance. FontAwesome icons have per-icon
// widths (fa-folder is 1.125em, fa-brain 1em), so without this the name's left edge shifts
// depending on which semantic icon a folder resolves to, and never lands on the 30px the
// "Empty" line is aligned to. 20px slot + 10px gap = the 30px emptyLineStyle pads by.
const GLYPH_SLOT = 20

const glyphStyle: CSSProperties = {
  fontSize: 16,
  color: 'color-mix(in srgb, var(--foreground) 28%, transparent)',
  flexShrink: 0,
  width: GLYPH_SLOT,
  textAlign: 'center',
}

const nameStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  lineHeight: '22px',
  color: 'var(--foreground)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
}

const countStyle: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 14,
  fontWeight: 500,
  color: 'color-mix(in srgb, var(--foreground) 50%, transparent)',
  flexShrink: 0,
}

const chevronBaseStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  flexShrink: 0,
}

const shelfRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  height: SHELF_TILE_HEIGHT,
}

const tileBaseStyle: CSSProperties = {
  width: SHELF_TILE_WIDTH,
  height: SHELF_TILE_HEIGHT,
  borderRadius: 10,
  flex: 'none',
  background: 'color-mix(in srgb, var(--foreground) 6%, var(--card-bg))',
}

const documentTileStyle: CSSProperties = {
  ...tileBaseStyle,
  boxSizing: 'border-box',
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 4,
}

const documentBarStyle: CSSProperties = {
  height: 3,
  borderRadius: 2,
  background: 'color-mix(in srgb, var(--foreground) 18%, transparent)',
}

const mediaTileStyle: CSSProperties = {
  ...tileBaseStyle,
  backgroundImage:
    'repeating-linear-gradient(45deg, color-mix(in srgb, var(--foreground) 8%, var(--card-bg)) 0 5px, color-mix(in srgb, var(--foreground) 3%, var(--card-bg)) 5px 10px)',
}

const folderTileStyle: CSSProperties = {
  ...tileBaseStyle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const folderTileGlyphStyle: CSSProperties = {
  fontSize: 14,
  color: 'color-mix(in srgb, var(--foreground) 22%, transparent)',
}

const overflowTileStyle: CSSProperties = {
  ...tileBaseStyle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const overflowTextStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'color-mix(in srgb, var(--foreground) 45%, transparent)',
}

const emptyLineStyle: CSSProperties = {
  fontSize: '12.5px',
  fontWeight: 500,
  lineHeight: '16px',
  color: 'color-mix(in srgb, var(--foreground) 35%, transparent)',
  paddingLeft: GLYPH_SLOT + 10, // aligns with the name's left edge (glyph slot + header gap)
}

// document-ish (blockNote / text / stickyNote / link) -> stacked bars
// image/file -> diagonal stripe fill
// canvas -> mini folder glyph
const SHELF_TILE_VARIANT: Record<FolderPeekKind, 'document' | 'media' | 'folder'> = {
  document: 'document',
  note: 'document',
  link: 'document',
  image: 'media',
  file: 'media',
  canvas: 'folder',
}

function ShelfTile({ kind }: { kind: FolderPeekKind }) {
  const variant = SHELF_TILE_VARIANT[kind]

  if (variant === 'document') {
    return (
      <div style={documentTileStyle}>
        <span style={{ ...documentBarStyle, width: '100%' }} />
        <span style={{ ...documentBarStyle, width: '75%' }} />
        <span style={{ ...documentBarStyle, width: '55%' }} />
      </div>
    )
  }

  if (variant === 'media') {
    return <div style={mediaTileStyle} />
  }

  return (
    <div style={folderTileStyle}>
      <i className="fa-solid fa-folder" style={folderTileGlyphStyle} aria-hidden="true" />
    </div>
  )
}

function ShelfOverflowTile({ count }: { count: number }) {
  return (
    <div style={overflowTileStyle}>
      <span style={overflowTextStyle}>+{count}</span>
    </div>
  )
}

function CanvasNodeComponent({ id, data, selected }: CanvasNodeProps) {
  const { onCanvasSelect, documentName, folderPeek, isTopLevelCanvas } = data
  const name = documentName || 'Canvas'
  const count = folderPeek?.count ?? 0
  const kinds = folderPeek?.kinds ?? []
  const isEmpty = count === 0
  const iconClassName = getCanvasIconClassName(name, isTopLevelCanvas ?? false)

  const handleDoubleClick = () => {
    onCanvasSelect?.(id)
  }

  return (
    <div
      className={`border box-border cursor-pointer node-card-blocknote node-card-folder ${selected ? 'node-card-selected' : ''}`}
      style={{
        width: FOLDER_CARD_WIDTH,
        height: isEmpty ? FOLDER_CARD_HEIGHT_EMPTY : FOLDER_CARD_HEIGHT,
        padding: isEmpty ? EMPTY_PADDING : FILLED_PADDING,
        display: 'flex',
        flexDirection: 'column',
        gap: isEmpty ? EMPTY_GAP : FILLED_GAP,
      }}
      onDoubleClick={handleDoubleClick}
    >
      <div style={headerRowStyle}>
        <i className={iconClassName} style={glyphStyle} aria-hidden="true" />
        <span style={nameStyle}>{name}</span>
        {count > 0 && <span style={countStyle}>{count}</span>}
        <span
          className="node-card-folder-chevron"
          style={count > 0 ? chevronBaseStyle : { ...chevronBaseStyle, marginLeft: 'auto' }}
          aria-hidden="true"
        >
          ›
        </span>
      </div>

      {isEmpty ? (
        <span style={emptyLineStyle}>Empty</span>
      ) : (
        <div style={shelfRowStyle}>
          {kinds.slice(0, SHELF_TILE_LIMIT).map((kind, index) => (
            <ShelfTile key={index} kind={kind} />
          ))}
          {count > SHELF_TILE_LIMIT && <ShelfOverflowTile count={count - SHELF_TILE_LIMIT} />}
        </div>
      )}
    </div>
  )
}

export default memo(CanvasNodeComponent)
