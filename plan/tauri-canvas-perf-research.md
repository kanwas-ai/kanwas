> **Status update (2026-07-21):** The desktop shell moved from Tauri/WKWebView
> to Electron/Chromium (see `plan/electron-migration-plan.md`). The
> WebKit-specific workarounds documented below (`engine-webkit` class,
> `frontend/src/lib/engine.ts`, `useCrispViewport.ts`, and the WebKit-gated CSS
> in `index.css`) have been removed from the frontend — Chromium never needed
> them. Viewport culling (`useViewportCulling.ts`) was kept as a general,
> engine-agnostic optimization. This document is retained as history: it
> explains why Tauri/WKWebView was abandoned.

# Tauri Canvas Performance Research (Jul 2026)

Why the Kanwas canvas is laggy/blurry in the Tauri desktop app (WKWebView) but smooth in Chrome.
Researched 2026-07-20 on the `local-first` branch.
Status: fixes 1, 3, 4 below implemented 2026-07-20 (viewport culling in
`frontend/src/components/canvas/useViewportCulling.ts`, WebKit-gated CSS under the
`engine-webkit` root class via `frontend/src/lib/engine.ts` + `index.css` overrides).
Fix 2 (LOD) deferred — visibly changes zoomed-out rendering; measure 1/3/4 first.
The remaining at-rest blur (canvas stays blurry at zoom > 1 whenever any BlockNote
editor UI is open, no gesture required) was root-caused and fixed 2026-07-20:
@floating-ui/react writes inline `will-change: transform` on the wrapper divs it
positions for BlockNote's side menu / formatting toolbar / slash menu, which mount
inside `.react-flow__viewport`. That one composited descendant forces WebKit to
composite the viewport itself, which then rasterizes at scale 1 and stretches the
cached bitmap (#27684). Fixed with a `.engine-webkit .react-flow__viewport *`
`will-change: auto !important` reset in `frontend/src/index.css`.

## TLDR

Not a Tauri misconfiguration. The desktop shell (`desktop/src-tauri/main.rs`) is a thin WKWebView
loading the exact same daemon-served bundle (`http://127.0.0.1:4300`) that Chrome loads. Every
difference comes from the WebKit engine:

1. **Zoom blur** — WebKit rasterizes composited layers once at a cached scale and GPU-stretches the
   bitmap during `transform: scale()`; it only repaints at the new scale after the gesture ends
   (the visible "fetch"). Chrome fixed this in 2016 by re-rasterizing continuously during scale.
2. **Pan/drag lag** — WebKit's slower CPU rasterization colliding with a paint-expensive canvas
   (live editors everywhere, big blur shadows, backdrop-filters), plus documented
   WKWebView-embedding penalties (frame-pacing jitter even at steady 60fps).

## Engine facts (with sources)

### Zoom blur: WebKit bug #27684

- "Composited elements appear pixelated when scaled up using transform" — filed **2009**, still
  open (P2, ASSIGNED), 17 duplicates. WebKit rasterizes a composited layer at its `contentsScale`
  and stretches the cached bitmap while scale changes; no re-raster during the gesture.
  Simon Fraser (WebKit compositing owner) on why it's unfixed: "terrible performance if a page is
  animating scale via JS." Patches attempted and reverted.
  https://bugs.webkit.org/show_bug.cgi?id=27684
- Chrome fixed exactly this in M53 (2016): re-rasters on every scale change _unless_
  `will-change: transform` is set (which opts into speed over crispness).
  https://developer.chrome.com/blog/re-rastering-composite
- Content becomes sharp again only when the layer decomposites and repaints (e.g. `will-change`
  removed at gesture end). A permanently-composited scaled container **never** settles.
- This reproduces in Safari itself — it's WebKit-wide, not Tauri-specific.

### FPS cap and frame pacing (WKWebView / Tauri)

- WebKit capped rAF at 60Hz for years (WebKit bug #173434), controlled by the
  "Prefer Page Rendering Updates near 60fps" feature flag — flippable in Safari, **no public API**
  in WKWebView on macOS 13–15.
- **macOS 26 (Tahoe) removed the cap** — WKWebView renders at native refresh rate by default.
  This machine runs macOS 26.5 (Darwin 25.5), so the 60Hz cap does NOT apply here.
  `tauri-plugin-macos-fps` (private `_setEnabled:forFeature:` API, not App Store safe) only
  matters for users on macOS 13–15. https://github.com/userFRM/tauri-plugin-macos-fps
- Even at a steady 60fps, WKWebView embedding shows **frame-pacing jitter** and
  composition-bound slowness that Safari doesn't, with identical content:
  - tauri discussion #8436 — micro-lag scrolling in Tauri, smooth in Safari/Chrome; Info.plist
    keys (`CADisplayLinkMinimumFramesPerSecond` etc.) had no effect.
    https://github.com/tauri-apps/tauri/discussions/8436
  - tauri #6577 — simple CSS animations drop frames, "composition" exceeds frame budget, worsens
    with window size. https://github.com/tauri-apps/tauri/issues/6577
  - tauri #13978, #11822 — closed "not planned" (platform constraint).
- `"transparent": true` on the window causes continuous full-window recomposite (~8x GPU power,
  tauri #15471). **Kanwas is fine** — window has opaque `backgroundColor: "#282726"`.
- `backdrop-filter` is inherently expensive in WebKit: backdrop must be re-rendered, filtered,
  and re-composited every frame the content behind it changes; cost scales with area and radius.
  https://webkit.org/blog/3632/introducing-backdrop-filters/

### Workarounds that do NOT work (don't retry these)

- `translate3d(0,0,0)` / `translateZ` parent hacks — "unreliable" across 17 years of #27684
  comments; xyflow maintainer "had no luck" either (xyflow discussion #4617).
- Static (always-on) `will-change: transform` — pins the layer composited = permanently blurry
  in WebKit, and explicitly disables re-raster in Chrome too.
- Info.plist frame-rate keys — no effect on WKWebView.
- `image-rendering`, `-webkit-transform-style` — no evidence anywhere that they help.
- Alternate webview engines — partial improvement at best, new input bugs.

### The workaround that DOES work (already implemented)

Toggled compositing: `will-change: transform` on gesture start, removed on gesture end so WebKit
decomposites and repaints crisp, plus rounding viewport translate to integers on move end
(xyflow #3282, maintainer-endorsed). **This is exactly what
`frontend/src/components/canvas/useCrispViewport.ts` does — keep it.** The remaining problem is
that the end-of-gesture repaint is slow because the canvas is expensive to paint (below).

## Kanwas-specific paint hazards (why the repaint/"fetch" is slow)

Found in the codebase 2026-07-20:

1. **No viewport culling.** `onlyRenderVisibleElements` is not set anywhere; all nodes are always
   mounted (`CanvasFlowSurface.tsx`). Offscreen documents rasterize too.
2. **Every document node is a live BlockNote/ProseMirror editor at all zoom levels**
   (`nodes/BlockNoteNode.tsx` — `useCreateBlockNote` + `BlockNoteView`, always mounted, no LOD).
3. **28px-blur box-shadow on every card** — `--card-shadow: 0 8px 28px …`
   (`frontend/src/index.css:93` light, `:235` dark, applied at `.node-card-blocknote`). Large blur
   shadows are among the slowest things a CPU rasterizer paints.
4. **Backdrop filters over/inside the moving canvas:**
   - `.canvas-toolbar-pill` — `backdrop-filter: blur(28px) saturate(1.7)` (`index.css:1502`),
     floats above the canvas → re-filtered every pan/zoom frame.
   - `.workspace-interlink-toolbar` — `backdrop-filter: blur(8px)` (`index.css:1331`).
   - `LinkNode.tsx:44` and `ImageNode.tsx:198` — `backdrop-blur-md` elements _inside_ the
     transformed viewport layer.
5. Node transform transition (`.react-flow__node { transition: transform 150ms }`,
   `index.css:772`) is correctly excluded during drag (`.dragging`, `.canvas-multi-dragging`) —
   not a problem.
6. WebKit-specific CSS fixes already landed on this branch: `user-select: text` for `.nodrag`
   (WebKit honors `all` in contenteditable → whole-doc selection), and `font-synthesis: none`
   (fake bold renders blurry in WKWebView on mixed-DPI displays).
7. **@floating-ui/react's inline `will-change: transform`.** BlockNote's floating UI (side menu
   drag handle, formatting toolbar, slash menu) is positioned by `@floating-ui/react`, which
   writes `will-change: transform` directly as an inline style on the wrapper div it mounts
   _inside_ `.react-flow__viewport`. That single composited descendant is enough to force WebKit
   to composite the whole viewport, which then hits #27684 and rasterizes at scale 1. Unlike the
   other hazards here, this one explains blur **at rest** — no pan/zoom gesture required, just
   having any editor UI open while zoomed in. Fixed via a WebKit-gated `will-change: auto
!important` reset on `.react-flow__viewport *`.

## Recommendations (ranked by expected impact)

1. **Viewport culling** — DONE: `useViewportCulling.ts` hides offscreen node wrappers
   (`visibility: hidden` direct DOM writes, 50%-viewport buffer, rAF-coalesced, nodes stay
   mounted so editor state survives — NOT `onlyRenderVisibleElements`, which would remount
   editors). Applies in all engines. tldraw does the equivalent
   (spatial index + `display: none`, https://tldraw.dev/sdk-features/culling).
2. **Level-of-detail for documents** — DEFERRED: below a zoom threshold, render a static
   snapshot instead of a live BlockNote editor (tldraw: debounced zoom level for LOD). Visibly
   changes zoomed-out rendering; revisit if the zoom-end repaint is still slow after 1/3/4.
   Note: this is the only fix that helps the fully-zoomed-out case, where culling hides nothing.
3. **Kill or gate backdrop-filters in WebKit** — DONE: `engine-webkit` class on `<html>`
   (`lib/engine.ts`, added in `main.tsx`), overrides in `index.css` remove backdrop-filter from
   the toolbar pill (bg → 0.97 alpha), interlink toolbar, and all Tailwind `backdrop-blur-*`
   uses (also affects modals in WebKit — accepted trade).
4. **Cheaper card shadows** — DONE: `--card-shadow` under `.engine-webkit` is
   `0 4px 10px` (alpha bumped 0.18/0.45) vs `0 8px 28px` elsewhere.
5. **Keep `useCrispViewport` unchanged** — it's the correct pattern; 1–4 make its end-of-gesture
   repaint fast enough to stop reading as a tile fetch.

Blur _during_ the pinch will never fully match Chrome (WebKit has declined to fix #27684 since
2009); the achievable target is instant crispness on release + smooth pans.

## Other references

- xyflow #3282 (fractional translate blur + rounding fix): https://github.com/wbkd/react-flow/issues/3282
- xyflow discussion #4617 (toggled will-change success report): https://github.com/xyflow/xyflow/discussions/4617
- tldraw PR 5771 (issue #1805): about Safari trackpad pinch-zoom _speed_, not blur — verified,
  do not cite as a blur fix. https://github.com/tldraw/tldraw/pull/5771
- tldraw perf overview: https://tldraw.dev/sdk-features/performance
- Excalidraw sidesteps DOM-layer blur entirely by drawing to `<canvas>` at devicePixelRatio.
- WKWebView background throttling (occluded windows suspend rAF/timers): wry #1246, tauri #5250;
  `backgroundThrottling: "disabled"` config landed in Tauri PR #12181 (macOS 14+).
