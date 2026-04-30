import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { subscribe, snapshot as valtioSnapshot } from 'valtio'
import type { CanvasItem, WorkspaceDocument } from 'shared'

/**
 * Structural fingerprint — captures ids, names, types, order but NOT positions.
 * Used to gate sidebar/interlinks updates so they skip position-only changes.
 */
function computeStructureFingerprint(root: CanvasItem | null): string {
  if (!root) return ''
  const fp = (c: CanvasItem): string => {
    const items = c.items
      .map((i) =>
        i.kind === 'canvas' ? `c:${i.id}:${i.name}[${fp(i as CanvasItem)}]` : `n:${i.id}:${i.name}:${i.xynode.type}`
      )
      .join(',')
    const groups = (c.groups ?? []).map((g) => `g:${g.id}:${g.name}:[${g.memberIds.join(',')}]`).join(',')
    const sections = (c.sections ?? [])
      .map((section) => `s:${section.id}:${section.title}:${section.layout}:[${section.memberIds.join(',')}]`)
      .join(',')
    return `${c.id}:${c.name}{${items}}${groups ? `<${groups}>` : ''}${sections ? `(${sections})` : ''}`
  }
  return fp(root)
}

/**
 * Subscribe to workspace store changes, but only re-render when tree STRUCTURE
 * changes (add/remove/rename/reorder) — not on every position update during drag.
 *
 * Returns a frozen snapshot of root suitable for the sidebar, and the raw
 * fingerprint string for use as a memo dependency.
 */
export function useWorkspaceStructure(store: WorkspaceDocument) {
  const subscribeStore = useCallback((callback: () => void) => subscribe(store, callback), [store])
  const getStructureFingerprint = useCallback(
    () => computeStructureFingerprint(store.root as CanvasItem | null),
    [store]
  )
  const structureFingerprint = useSyncExternalStore(subscribeStore, getStructureFingerprint)

  // Frozen snapshot of root — only recreated when structure changes

  const sidebarRoot = useMemo(() => {
    void structureFingerprint
    if (!store.root) return null
    return valtioSnapshot(store).root as CanvasItem | null
  }, [structureFingerprint, store])

  return { structureFingerprint, sidebarRoot }
}
