# Folder cards on the Kanwas canvas — visual handover

Handover for a design pass on **folders** (a.k.a. "canvases"/directories) as they appear on the
Kanwas canvas. Everything below is the _current_ implemented state, read from source on
2026-08-10 (branch `local-first`). Values are exact — resolved to hex/px where tokens indirect.

---

## 1. What a folder _is_

Kanwas is folder-as-truth: the canvas is a view of a real directory on disk.

- A **folder** = `CanvasItem` with `kind: 'canvas'` in the workspace tree = one directory on disk.
- It renders on its _parent_ canvas as a ReactFlow node with `xynode.type: 'canvas'`,
  registered as `canvas: CanvasNode` in `frontend/src/components/canvas/CanvasFlow.config.ts`.
- Double-clicking it navigates _into_ that folder (the whole canvas swaps to the folder's contents).
  There is no "expand in place" — a folder is a door, not a container you can see into.
- Documents (`.md` notes), images, files, links, sticky notes are siblings of folders on the same
  canvas and use much larger cards. **The folder card is the smallest, plainest card in the family.**

Folders appear on two surfaces: the **canvas card** (§3, the thing to redesign) and the
**sidebar tree row** (§4, keep visually coherent).

---

## 2. Anatomy (current)

```
        268 px
┌───────────────────────────────────────────────┐
│                                               │
│   [icon]  Folder name                     3   │  56 px
│                                               │
└───────────────────────────────────────────────┘
 ↑20px  ↑12px                              20px↑

 icon  = FontAwesome fa-solid fa-folder, 16px, foreground @30%
 name  = 16px / 700, foreground, NOT truncated
 3     = direct child count, 16px / 500, foreground @50%
```

Single flex row, `justify-between`, vertically centred. That is the entire card — no name label
above it, no preview, no thumbnail, no emoji, no metadata, no toolbar.

Source: `frontend/src/components/canvas/nodes/CanvasNode.tsx` (84 lines — the whole component).

---

## 3. Canvas folder card — exact current spec

### Box

| Property | Value                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------- |
| Width    | `268px` (hard-coded inline)                                                                           |
| Height   | `56px` (hard-coded inline)                                                                            |
| Padding  | `0 20px`, `box-sizing: border-box`                                                                    |
| Radius   | `20px` (`--card-radius`)                                                                              |
| Border   | `1px` solid (`--card-border-width` / `--card-border`)                                                 |
| Shadow   | `--card-shadow`                                                                                       |
| Opacity  | `--card-opacity` (1)                                                                                  |
| Cursor   | `pointer`                                                                                             |
| Content  | flex row, `align-items:center`, `justify-content:space-between`, full height; left cluster `gap:12px` |

The box styling comes from the shared class `.node-card-blocknote` (`frontend/src/index.css:1600`),
which every card in the app uses — folder, document, collapsed card. **Restyling that class
restyles all cards.** Folder-only changes belong in `CanvasNode.tsx`.

### Typography

- Family: `Inter`, then system stack (set on `body`; nothing overrides it on cards).
- Name: `16px`, weight `700`, default line-height, no letter-spacing, **no `truncate`** —
  a long folder name grows past 268px and shoves the count out of the card.
- Count: `16px`, weight `500`. Always rendered, including when the folder is empty (`0`).
- Count semantics: _direct_ children only; a subfolder counts as 1. Matches the sidebar.

### Resolved colors

**Light** (canvas background `#faf9f5`)

| Part                 | Value                                  |
| -------------------- | -------------------------------------- |
| Card surface         | `#ffffff`                              |
| Border               | `#f0ece0`                              |
| Shadow               | `0 8px 28px -10px rgba(86,75,44,0.16)` |
| Folder icon          | `rgba(44,41,32,0.30)`                  |
| Name                 | `#2c2920`                              |
| Count                | `rgba(44,41,32,0.50)`                  |
| Border when selected | `#f0d69a`                              |

**Dark** (canvas background `#313030`)

| Part                 | Value                               |
| -------------------- | ----------------------------------- |
| Card surface         | `#242424`                           |
| Border               | `#252525`                           |
| Shadow               | `0 8px 28px -14px rgba(0,0,0,0.35)` |
| Folder icon          | `rgba(198,197,197,0.30)`            |
| Name                 | `#c6c5c5`                           |
| Count                | `rgba(198,197,197,0.50)`            |
| Border when selected | `#775f26`                           |

The icon/count colors are written as `color-mix(in srgb, var(--foreground) 30% | 50%, transparent)`,
so they track `--foreground` automatically (`#2c2920` light, `#c6c5c5` dark).

### States — what exists today

| State        | Visual                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Default      | as above                                                                                                                            |
| **Hover**    | **nothing** — only the cursor changes                                                                                               |
| Selected     | border color swaps to `--card-border-accent` (amber). Nothing else. ReactFlow's default blue selection is explicitly killed in CSS. |
| Dragging     | inherited from `.react-flow__node.dragging`: transition off, `z-index:1000`. No card-level change.                                  |
| Multi-select | same amber border on each                                                                                                           |
| Drop target  | **none on canvas.** Dropping a node onto a folder card is not a gesture; only the sidebar tree has drop highlighting.               |
| Empty folder | no distinct treatment — shows `0`                                                                                                   |
| Rename       | not possible from the canvas card (sidebar only, or double-click the name in the sidebar)                                           |
| Focus / a11y | no focus ring, no `aria` roles, no keyboard affordance on the card                                                                  |

### Behavior

- **Double-click** → navigate into the folder (`onCanvasSelect(id)`, falls back to `setActiveCanvasId`).
- **Single click** → ReactFlow selection (also highlights the row in the sidebar).
- Draggable/positionable like any node; position is persisted to the workspace doc.
- No resize handle — the card is a fixed size by design.

### Scale context (important for legibility)

Default canvas zoom is `0.6` (`defaultCanvasViewport` in `CanvasFlow.config.ts`). At that zoom the
card is rendered at ~**161 × 34 CSS px** and the 16px name reads at ~**9.6px**. Users routinely sit
between ~0.4 and 1.0 zoom. Any new type sizes or fine details should survive being multiplied by 0.5.

---

## 4. Folder row in the sidebar (secondary surface — keep coherent)

`frontend/src/components/sidebar/explorer/TreeNode.tsx`, react-arborist tree.

- Row: `height 32px`, `padding 0 12px`, `margin 0 4px`, `border-radius 14px` (`--chat-radius`),
  weight 500.
- Icon: `11px`, `fa-solid fa-folder` at `opacity 0.70`, painted with `.icon-gradient`
  (a top-to-bottom gradient from `color-mix(icon-color, white 20%)` → icon color, clipped to text),
  color `--sidebar-icon` = `rgba(44,41,32,0.3)` light / `rgba(198,197,197,0.3)` dark.
- **On hover, if the folder has children, the folder icon fades out and a chevron
  (`fa-chevron-down`/`fa-chevron-right`, 9px) fades in** in the same 11×11 slot.
- Label: `14px` (`text-sm`), truncated, color `--sidebar-item-text` → `--sidebar-item-text-active`
  when active/selected.
- Count: `11px`, `--sidebar-icon`, fixed `20px` centred column, **hidden when 0 and hidden on
  hover** (a trash button takes its place at the right edge).
- Selected/active row background `--sidebar-selection` (`#f3f0e9` / `#2b2b2b`); hover
  `--sidebar-hover` (`#f7f5ef` / `#333333`).
- Drop target: `bg amber-bright @20% + 1px inset amber-bright ring`; descendants of the drop target
  get `amber-bright @10%`. (`--palette-amber-bright` = `#ffb300` light / `#ffd268` dark.)
- **Semantic icons, sidebar only:** top-level folders named `brain` or `memory` render
  `fa-brain`, `projects` renders `fa-diagram-project` (`sidebar-icons.ts`). The canvas card ignores
  this and always draws `fa-folder` — an inconsistency worth resolving in the redesign.

---

## 5. The rest of the card family (stay in the family)

| Card                 | Size         | Notes                                                                                                                                                                                                          |
| -------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document (BlockNote) | `720 × ≥144` | Has a **name label rendered _above_ the card** (`DocumentName`: 14px/500, color `--document-name` `#929292` / `#4e4e4e`, `padding 4px 4px 4px 16px`, double-click to rename). Same `.node-card-blocknote` box. |
| Collapsed card       | `268 × 126`  | Same 268 width as the folder card. Emoji `28px` + title `18px/700` + 2-line summary `14px/500` muted, padding `16px 18px`, plus a `DocumentName` label above.                                                  |
| File card            | `280` wide   | `--editor` background (not white), radius `20px`, 112px icon, `border-outline`.                                                                                                                                |
| Group / Section      | auto         | Background containers behind nodes, `z-index` -1 / -2 — a different concept from folders; don't merge them.                                                                                                    |

The folder card is the only card with **no name label above it** — its name lives inside the card.
That's the main structural asymmetry a redesign should consciously keep or fix.

---

## 6. Constraints the redesign must respect

1. **Theme by token, not by hex.** Every color must resolve through the CSS custom properties in
   `frontend/src/index.css` (`:root` for light, `.dark` for dark). Both themes must be specified.
2. **Fixed size is load-bearing, and it's declared in three places.** If the card's dimensions change:
   - `CanvasNode.tsx` — inline `width`/`height` (the real render)
   - `canvasFitView.ts` → `CANVAS_CARD_FALLBACK` (`268 × 56`) — used for fit-to-view before ReactFlow
     has measured the DOM node
   - `shared/src/constants.ts` → `CANVAS_NODE_LAYOUT` (`250 × 220`) — **already stale**; drives
     vertical spacing when creating a folder and folder sizing inside sections. It reserves 220px of
     vertical space for a 56px card.
3. **Renders hundreds at a time.** Cards are plain DOM inside a CSS-transformed ReactFlow viewport.
   Avoid `backdrop-filter`, `filter`, per-card `will-change`, and animated shadows on the default
   state — they promote compositing layers across the whole viewport. (A WebKit-specific guard for
   this existed while the desktop shell was Tauri; the shell is Electron/Chromium now and the guard
   is gone, but the perf argument stands.)
4. **`memo()` + node cache.** The component is `memo()`'d and its props come from a projection cache
   (`useCanvasNodeProjection.ts`). New per-frame data in node `data` breaks the cache — see
   `frontend/CLAUDE.md` "Canvas Performance".
5. **Icons come from a FontAwesome kit** loaded via `<script src="kit.fontawesome.com/e33949a08a.js">`
   in `frontend/index.html`. Current usage is `fa-solid` only. Confirm which styles that kit ships
   before specifying duotone/thin/sharp; inline SVG is the safe alternative.
6. **Tailwind v4 + inline styles.** The codebase mixes utility classes with inline `style` objects
   in node components. Either is fine; shared card chrome belongs in `index.css`.
7. Selection color is the amber accent (`--card-border-accent`) across all cards — don't invent a
   folder-only selection color unless you're changing the system.

---

## 7. Files to touch

| File                                                                                 | Role                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `frontend/src/components/canvas/nodes/CanvasNode.tsx`                                | **the folder card** — markup, size, icon, type, count |
| `frontend/src/index.css` (`:root` ~L90, `.dark` ~L236, `.node-card-blocknote` L1600) | tokens + shared card chrome                           |
| `frontend/src/components/canvas/canvasFitView.ts`                                    | `CANVAS_CARD_FALLBACK` must match new dimensions      |
| `shared/src/constants.ts` → `CANVAS_NODE_LAYOUT`                                     | placement/section sizing (currently wrong)            |
| `frontend/src/components/sidebar/explorer/TreeNode.tsx`                              | sidebar folder row, if it should follow               |
| `frontend/src/components/sidebar/explorer/sidebar-icons.ts`                          | semantic folder icons (brain/memory/projects)         |

Note: `shared` must be rebuilt after edits — `pnpm --filter shared build`.

---

## 8. Live tuning tool

There's a dev panel for card chrome: **`Ctrl+Shift+E`** toggles `CardStyleEditor`
(`frontend/src/components/dev/CardStyleEditor.tsx`, gated on `import.meta.env.DEV` or
`localStorage['kanwas-card-style-editor-enabled'] === '1'`). It edits
bg / radius / border width / border color+alpha / opacity / shadow / selected-accent per theme,
writes a `<style>` override tag live, persists to localStorage, and can export the CSS block or a
handoff markdown snippet.

Caveat: it drives the **shared** `--card-*` tokens, so it previews the change on _every_ card, not
just folders. Good for dialling in surface/border/shadow; not usable for folder-specific layout.

---

## 9. Known gaps / opportunities (candidate brief)

Not decisions — observations a design pass should have an opinion about.

1. **No hover state at all.** The card is clickable and double-clickable but gives zero feedback.
2. **Weak affordance that it's enterable.** Nothing signals "double-click to go in"; new users
   don't discover navigation. The sidebar's hover chevron is the only hint anywhere.
3. **Name doesn't truncate** — long folder names break the layout and push the count out.
4. **`0` is always shown** for empty folders; the sidebar hides it. Pick one.
5. **Identical to nothing else in the hierarchy** — a folder card carries no sense of what's inside
   (count only). Options: stacked-card silhouette, child-type dots, mini preview, contents peek.
6. **Semantic icons only exist in the sidebar** (brain / memory / projects). The canvas is always a
   generic folder.
7. **No drop-onto-folder gesture on canvas** — you can only reorganise via the sidebar tree.
   If the redesign implies a drop target, that's new interaction work, not just styling.
8. **Small at working zoom** (~161×34 px at 0.6). Consider whether the card should scale its detail,
   or whether folders deserve to be visually _heavier_ than documents given they're navigation.
9. **Stale layout constant** (`250 × 220`) makes newly created folders sit 220px apart vertically.

---

## 10. Reference snippet — the entire current card

```tsx
<div
  className={`border node-card-blocknote box-border cursor-pointer ${selected ? 'node-card-selected' : ''}`}
  style={{ width: '268px', height: '56px', padding: '0 20px' }}
  onDoubleClick={handleDoubleClick}
>
  <div className="flex items-center justify-between h-full">
    <div className="flex items-center gap-3">
      <i
        className="fa-solid fa-folder"
        style={{ fontSize: '16px', color: 'color-mix(in srgb, var(--foreground) 30%, transparent)' }}
      />
      <span className="font-bold" style={{ fontSize: '16px', color: 'var(--foreground)' }}>
        {documentName}
      </span>
    </div>
    <span
      className="font-medium"
      style={{ fontSize: '16px', color: 'color-mix(in srgb, var(--foreground) 50%, transparent)' }}
    >
      {itemCount}
    </span>
  </div>
</div>
```

```css
/* frontend/src/index.css:1600 — shared by every card */
.node-card-blocknote {
  background-color: var(--card-bg);
  border-radius: var(--card-radius);
  border-width: var(--card-border-width);
  border-color: var(--card-border);
  box-shadow: var(--card-shadow);
  opacity: var(--card-opacity);
}
.node-card-selected {
  border-color: var(--card-border-accent) !important;
}
```
