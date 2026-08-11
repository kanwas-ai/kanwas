# Sticky note scaling/resize + text node size & color settings

## Goals

1. **Sticky notes**: text auto-scales to fit the note (shrinks as content grows, scales up
   with bigger notes), and notes are resizable via a bottom-right corner handle that
   appears on hover.
2. **Text nodes** ("free form text"): a size setting (Small / Medium / Large / Super large)
   and a color setting in the side toolbar, instead of one fixed size/color.

## Constraints discovered in recon

- Persistence is already solved: `metadata.yaml` round-trips `xynode.width/height` and the
  full `data` object (`local-daemon/src/canvas-metadata.ts`, `adopt.ts`,
  `shared/src/workspace/converter.ts:cloneNodeForMetadata`). `applyNodeChangesToCanvas`
  (`frontend/src/utils/applyChanges.ts`) writes `dimensions` changes with `setAttributes`
  to `xynode.width/height`. `TextNodeData.fontSize`/`color` already round-trip through
  `.text.yaml` in `filesystem-syncer.ts` + `converter.ts`. **No daemon/sync changes needed.**
- `ImageNode.tsx` is the reference pattern for hover-visible `NodeResizeControl`.
- Sticky font-size is hardcoded `32px !important` in `frontend/src/index.css`
  (`.sticky-note-editor` rules) — becomes `var(--sticky-font-size, 32px)`.
- Canvas perf rules (frontend/CLAUDE.md): node components memo'd, no unstable callbacks in
  node data, don't add frequently-changing values to node `data`. Auto-fit font size must
  NOT live in node data or Valtio — it's derived, local, applied via CSS var on the DOM.

## Workstream A — sticky notes (StickyNoteNode.tsx, new hook, index.css, shared/src/types.ts)

1. **Resize**: `NodeResizeControl` bottom-right, visible on hover (copy ImageNode's
   opacity/group-hover approach, reuse `ResizeHandle` canvas glyph with a color derived from
   the sticky's `text`/`to` color). Free aspect. Min 160×160, max 960×960. Component reads
   `width`/`height` node props (like ImageNode) with defaults from
   `STICKY_NOTE_NODE_LAYOUT` (240×240). Body div: `width: nodeWidth`,
   `minHeight: nodeHeight` — min-height (not fixed height) so a note still grows when
   content overflows at minimum font size (today's behavior).
2. **Auto-fit text**: new `frontend/src/hooks/useStickyTextAutoFit.ts`.
   - Max font scales with note width: `maxFont = clamp(round(32 * width / 240), 16, 96)`.
   - Min font: 14.
   - Measure editor content height vs available body height (ResizeObserver on the editor
     wrapper + container); converge font size in a rAF loop (capped iterations, damped
     proportional step) and write `--sticky-font-size` directly onto the wrapper element
     style. No React state per frame, no Valtio writes.
   - Extract the pure step function (`nextStickyFontSize(contentH, availableH, font, {min,max})`
     or similar) and unit-test it (vitest, colocated with frontend tests).
   - `index.css`: every `font-size: 32px !important` under `.sticky-note-editor` →
     `font-size: var(--sticky-font-size, 32px) !important`. Line-height stays 1.15.
3. **Type fix**: `StickyNoteNodeData.color` union in `shared/src/types.ts` lists 6 colors
   but the UI has 10 — widen to include `beige | coral | teal | burgundy`. Rebuild shared.

## Workstream B — text nodes (TextNode.tsx, NodeSideToolbar.tsx, nodeConstants.ts)

1. **Size presets** in `NodeSideToolbar` (rendered for text nodes only, new optional prop):
   Small 44 / Medium 88 / Large 144 / Super large 220 → sets `data.fontSize` per node.
   Raise `MAX_FONT_SIZE` in TextNode.tsx to 220. Panel highlights the active preset
   (nearest match, since drag-resize can land between presets). Keep drag-resize.
2. **Color picker** for text nodes: ~10 flat swatches in `nodeConstants.ts`
   (`TEXT_COLOR_SWATCHES`), mid-tone hexes readable on both light and dark canvas,
   including current default `#B1A9A2`. Sets `data.color` per node.
3. **Toolbar API**: extend `NodeSideToolbarProps` with optional
   `textSize?: { current: number; onChange: (size: number) => void }` and
   `textColor?: { current: string; onChange: (color: string) => void }`; new panel modes.
   Sticky continues to pass only `stickyColor` + font.

## Validation (orchestrator)

- `pnpm --filter shared build` then `pnpm --filter shared test`
- `pnpm --filter frontend typecheck`, `pnpm --filter frontend lint`, `pnpm --filter frontend test`
- Manual diff review of both workstreams.

## Out of scope

- No git commits (user handles commits).
- Don't touch FocusModeOverlay, daemon, or the many unrelated modified files on this branch.
