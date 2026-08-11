import { useCallback, useEffect, useRef } from 'react'
import { useOnViewportChange, useStoreApi } from '@xyflow/react'

/**
 * Hides canvas nodes that are outside the viewport so WebKit (Tauri/WKWebView)
 * doesn't have to rasterize every live BlockNote editor + shadow at once —
 * the prior performance audit's "No viewport culling" finding.
 * Nodes stay mounted (editor state survives) but get
 * `visibility: hidden` written directly on the `.react-flow__node` wrapper.
 * Never `display: none` — React Flow's ResizeObserver measures wrappers to
 * get `measured.width/height`, and `display: none` would zero that and
 * corrupt layout.
 *
 * Node rects come from React Flow's store (`nodeLookup`), never
 * `getBoundingClientRect`, to avoid forcing layout. The cull rect is the
 * viewport in flow coordinates plus a buffer of ~50% of the viewport size on
 * each side, so nodes are revealed before they scroll into view.
 *
 * Recomputes are direct DOM writes only (no React state), so this never
 * triggers a re-render — see the "Canvas Performance" section in
 * renderer/CLAUDE.md. All recompute triggers are coalesced into a single
 * `requestAnimationFrame` call so at most one pass runs per frame.
 *
 * @param containerRef Ref to the element wrapping `<ReactFlow>` — scopes the
 *   `.react-flow__node` query instead of using `document`, since multiple
 *   flows could be mounted at once.
 * @param nodes The `nodes` prop passed to `<ReactFlow>`. Only referential
 *   identity is used, as a recompute trigger for add/remove/drag — values are
 *   read from the store, not from this array.
 */
export function useViewportCulling(containerRef: React.RefObject<HTMLElement | null>, nodes: object[]) {
  const storeApi = useStoreApi()
  const rafRef = useRef<number | null>(null)

  const recompute = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const { nodeLookup, transform, width, height } = storeApi.getState()
    const [x, y, zoom] = transform
    // No usable size/zoom yet (e.g. before the container's first resize
    // observation) -> leave everything as-is (fail open).
    if (!zoom || !width || !height) return

    const viewWidth = width / zoom
    const viewHeight = height / zoom
    const bufferX = viewWidth * 0.5
    const bufferY = viewHeight * 0.5
    const left = -x / zoom - bufferX
    const top = -y / zoom - bufferY
    const right = left + viewWidth + bufferX * 2
    const bottom = top + viewHeight + bufferY * 2

    const wrappers = container.querySelectorAll<HTMLElement>('.react-flow__node[data-id]')
    for (const el of wrappers) {
      // Never hide the node being dragged.
      if (el.classList.contains('dragging')) {
        if (el.style.visibility) el.style.visibility = ''
        continue
      }

      const internalNode = nodeLookup.get(el.dataset.id ?? '')
      const pos = internalNode?.internals.positionAbsolute
      const w = internalNode?.measured.width
      const h = internalNode?.measured.height

      // Fail open: no position/size yet (async measurement) -> visible.
      const outside =
        pos != null &&
        w != null &&
        h != null &&
        (pos.x + w < left || pos.x > right || pos.y + h < top || pos.y > bottom)

      if (outside) {
        if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
      } else if (el.style.visibility) {
        el.style.visibility = ''
      }
    }
  }, [containerRef, storeApi])

  const scheduleRecompute = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      recompute()
    })
  }, [recompute])

  useOnViewportChange({ onChange: scheduleRecompute })

  // Nodes added/removed/dragged (position writes land as a new `nodes`
  // identity). Also covers the once-after-mount recompute.
  useEffect(() => {
    scheduleRecompute()
  }, [nodes, scheduleRecompute])

  // Canvas remounts on switch (`key={activeCanvas.id}` in CanvasFlow) — clear
  // any inline visibility we set so it can't survive into the next mount.
  useEffect(() => {
    const container = containerRef.current
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      container?.querySelectorAll<HTMLElement>('.react-flow__node[data-id]').forEach((el) => {
        el.style.visibility = ''
      })
    }
  }, [containerRef])
}
