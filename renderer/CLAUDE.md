# Renderer Development Guide

## Canvas Node Components

Node components live in `src/components/canvas/nodes/`. Each node type needs:

- Component file (e.g., `BlockNoteNode.tsx`)
- Registration in `CanvasFlow.tsx` nodeTypes object

### Connecting to Yjs

For reactive data from yDoc, use Y.Map/Y.Array observers:

```
useEffect(() => {
  const map = yDoc.getMap('key')
  const observer = (event) => { /* update state */ }
  map.observe(observer)
  return () => map.unobserve(observer)
}, [yDoc])
```

The workspace's yDoc syncs with the embedded local runtime (`useWorkspace().yDoc`).

### Auto-resizing Textareas

For textareas that grow with content (no scrolling):

- Set `overflow-hidden` on the textarea
- On content change: `textarea.style.height = 'auto'; textarea.style.height = textarea.scrollHeight + 'px'`

## Importing from `shared`

**Warning**: Avoid runtime imports from the `shared` root entrypoint (`shared`). Keep root imports type-only.

Safe:

- `import type { BlockNoteNode } from 'shared'`
- `import { NODE_LAYOUT } from 'shared/constants'`
- `import { PathMapper } from 'shared/path-mapper'`

Unsafe:

- `import { findNoteBlockNoteFragment } from 'shared'`
- `import { ContentConverter } from 'shared/server'`

For simple Y.Doc operations, inline the logic in the component.

## Workspace Context

Key state from `useWorkspace()`:

- `activeCanvasId` - Currently viewed canvas ID
- `setActiveCanvasId` - Navigate to a canvas
- `workspaceId` - Workspace UUID
- `store` / `yDoc` - Workspace document tree and Yjs doc

**Important:** `activeCanvasId` may be a UUID or the root canvas id. When passing to API, don't assume every canvas id is a UUID.

> **Removed (local-first Step 1):** the built-in AI agent, chat UI, skills, and
> connections were deleted (`components/chat/`, `components/skills/`,
> `providers/chat/`, the agent api/hooks, and the sidebar "Powertools" panel).
> Local-first uses the user's own CLI agent (Claude Code / Codex) editing files
> in the folder; there is no in-app chat. Do not re-reference those modules.

## Canvas Performance (Node Cache & Memoization)

CanvasFlow uses a **node object cache** (`nodesCacheRef`) to avoid rebuilding every node on each render. It leverages Valtio's structural sharing: when one node's position changes (e.g., during drag), only that item gets a new snapshot reference. The cache compares snapshot identity — if `snapshot === cached`, the old node object is reused. ReactFlow's `memo(NodeWrapper)` with `shallow` comparison then skips re-rendering unchanged nodes.

**Key files:** `CanvasFlow.tsx` (cache logic in `nodes` useMemo), `canvas/types.ts` (`CommonNodeData`, `WithCanvasData`)

**Rules:**

- All node components must be wrapped in `memo()` and registered in the module-level `nodeTypes` object (not inline)
- Injected data props (callbacks, documentName, collapsed, etc.) are typed via `WithCanvasData<SharedNodeType>` from `canvas/types.ts` — never use `(data as {...}).prop` casts
- Callbacks in node `data` must be stable (`useCallback` with stable deps). Unstable callbacks bust the cache for all nodes every frame
- `nodesCacheRef` invalidates entirely when non-item deps change (callbacks, config). Adding new deps to node `data` means adding them to `prevNonItemDepsRef` too
- Don't add frequently-changing values to node `data` — they bypass the cache. Use context (like `WorkspaceInterlinksProvider`) for cross-cutting data consumed by specific node types
- UI components inside CanvasFlow that don't change during drag (AddNodeButton, CollapseAllButton) must be `memo()`'d to avoid re-rendering on every frame

**WorkspaceContent decoupling:** `WorkspaceContent` does NOT use `useSnapshot(store)`. Instead, `useWorkspaceStructure` (`hooks/useWorkspaceStructure.ts`) uses `useSyncExternalStore` with a structural fingerprint that captures ids, names, types, and tree order — but NOT positions. This prevents the sidebar, chat, and all providers from re-rendering on every drag frame. If the sidebar ever needs to display a new field from the store, add it to `computeStructureFingerprint` or it won't update.

**ReactFlow controlled mode gotcha:** In controlled mode, ReactFlow does NOT move nodes visually during drag on its own. `onNodesChange` fires position changes that must be written back to the `nodes` prop. Skipping Valtio writes during drag makes nodes invisible.

## Canvas Selection

Selection state flows bidirectionally between canvas and sidebar:

- `WorkspacePage.tsx` - Manages `selectedNodeIds` state, localStorage persistence
- `CanvasFlow.tsx` - ReactFlow component, `onSelectionChange` callback, `onPaneClick` to deselect
- `TreeNode.tsx` - Highlights selected nodes in sidebar

**Key patterns:**

- Use a ref (`selectedNodeIdsRef`) alongside state to avoid stale closures in callbacks
- Per-canvas viewport (x, y, zoom) persisted to localStorage and restored on canvas switch

**Single vs double click:** TreeNode uses a 100ms timeout to distinguish single-click (select + fit) from double-click (zoom to 100%). Double-click cancels the pending single-click to avoid "move then zoom" effect.

**Canvas switch fade:** When switching canvases, opacity fades to 0 instantly, then back to 1 after 80ms. The CSS transition is 100ms, so fade-in starts before fade-out completes - this overlap is intentional for snappier feel. See `WorkspacePage.tsx`.

**CanvasFlow remount on switch:** `CanvasFlow` uses `key={activeCanvas.id}` to force full remount when switching canvases. This is intentional - ReactFlow has internal state that's hard to reset manually. Remounting gives a clean slate with same rendering cost (new nodes must render either way). Don't remove the key.

**Stale closure gotcha:** Using `array.length` as a useCallback dependency causes stale closures when array contents change but length stays the same. Fix: keep a ref in sync with state and read from ref inside callback.

## react-arborist Tree

The sidebar explorer uses react-arborist for the tree view.

**Virtualization gotcha:** `tree.get(nodeId)` only returns nodes that are currently rendered (visible). Collapsed nodes are not indexed due to virtualization, so `tree.get()` returns `null` for them.

**Opening parent nodes:** Use `tree.openParents(nodeId)` to expand the path to a node. This works directly with internal state and doesn't require the node to be rendered first. Don't try to manually traverse with `tree.get()` + `node.parent`.

**Bottom drop zone problem:** react-arborist only detects drops around actual tree items - `paddingBottom` creates visual space but no drop detection. Users couldn't drop items to make them last in the list.

**Solution - invisible spacer node:** We add a fake "spacer" item at the end of the tree data (`SPACER_ID` in `tree-utils.ts`). It renders as an empty row but provides a drop target below the last real item. The drop cursor is hidden when inside the spacer area so users don't see a line below nothing. See `tree-utils.ts`, `TreeNode.tsx`, and `hooks.ts` for implementation.

**Hidden items and index mismatch:** react-arborist gives visible indices in `onMove`, so we use `visibleToActualIndex()` in `hooks.ts` to convert them back to actual array positions when some items are filtered out of the rendered tree.

**Selection subscription pattern:** TreeNodes need to highlight when selected, but using normal React context would re-render ALL TreeNodes on every selection change. Instead, `useSelectedNodeIds()` uses `useSyncExternalStore` with a ref-based store - each TreeNode subscribes individually and only re-renders when selection affects it. Same pattern for `useDropTargetParentId()`. Don't replace with simple context.

**localStorage keys:**

- `kanwas:lastActiveCanvas:{workspaceId}` - Last active canvas ID
- `kanwas:lastSelectedNode:{workspaceId}:{canvasId}` - Last selected node per canvas
- `kanwas:viewport:{workspaceId}:{canvasId}` - Viewport position and zoom per canvas

## Keyboard Shortcuts

Use `providers/keyboard` for global shortcuts. It handles exclusive modes (modals) automatically.

**Global shortcut** - auto-disabled when exclusive mode is active:

```typescript
import { useKeyboardShortcut } from '@/providers/keyboard'

useKeyboardShortcut('Escape', handleClose)
useKeyboardShortcut('k', openSearch, { skipInputs: false })
```

**Exclusive mode** - locks keyboard for modals/special views:

```typescript
import { useKeyboard } from '@/providers/keyboard'

const { setExclusiveHandler } = useKeyboard()
useEffect(() => {
  setExclusiveHandler('my-modal')
  return () => setExclusiveHandler(null)
}, [])
```

**When to use:** Only for global shortcuts (`window.addEventListener`). Element-level handlers (`onKeyDown` on inputs/textareas) don't need this.

**Modifier keys:** `useKeyboardShortcut` supports `ctrl`, `shift`, and `alt` options. Note: `ctrl` is strictly Ctrl key (not Cmd on Mac) to avoid conflicts with native shortcuts.

## Workspace Search

`Ctrl+Space` opens a search modal to find nodes and canvases. Uses MiniSearch for client-side full-text search.

- `useWorkspaceSearch` hook - builds index from `store.root` and `yDoc`, searches names and content
- `SearchModal` component - keyboard nav with ↑↓, Enter to select, Esc to close
- Index rebuilds when workspace data changes

## Undo/Redo System

Two separate undo stacks managed by Yjs UndoManagers:

1. **Canvas undo** (`useWorkspaceUndoManager()`) - node positions, additions, deletions
   - Tracks `yDoc.getMap('state')` with `VALTIO_Y_ORIGIN`
   - Global Cmd+Z hotkey in `CanvasFlow.tsx` (disabled inside editors)

2. **Editor undo** (`useEditorUndoManager()`) - text content across all BlockNote editors
   - Tracks the BlockNote `noteDoc.getXmlFragment('content')` scopes from attached note subdocs with `ySyncPluginKey` from y-prosemirror
   - Shared across all editors for cross-editor undo
   - BlockNote's internal Cmd+Z uses this when focused in an editor

**BlockNote patch:** `@blocknote/core@0.46.0` is patched (`patches/@blocknote__core@0.46.0.patch`) to accept an `undoManager` option for its Y.XmlFragment binding. This allows passing the shared `editorUndoManager` to all editors. The collaboration provider is intentionally omitted, so BlockNote installs document and undo bindings without its awareness/cursor plugin.

**Behavior:**

- Inside editor: Cmd+Z undoes editor changes (shared across editors)
- Outside editor: Cmd+Z undoes canvas changes (node moves, etc.)
