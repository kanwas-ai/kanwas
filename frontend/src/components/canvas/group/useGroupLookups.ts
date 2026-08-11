import { useMemo, useRef } from 'react'
import type { GroupDef } from 'shared'
import { computeGroupGrid } from './groupLayout'

/**
 * Derived read-only group state from canvas snapshot.
 * Must be called before useCanvasLayout (provides groupedIds it needs).
 */
export function useGroupLookups(canvasGroups: GroupDef[] | undefined) {
  // Stable fingerprint: only changes when membership or columns change, NOT on position-only updates.
  // Prevents groupedIds/nodeToGroup/groupGrids from getting new references during group drag,
  // which would bust the entire node cache and force all nodes to re-render every frame.
  const groupStructureKey = useMemo(() => {
    return (canvasGroups ?? []).map((g) => `${g.id}:${(g.memberIds ?? []).join(',')}:${g.columns ?? ''}`).join('|')
  }, [canvasGroups])

  const { groupedIds, nodeToGroup } = useMemo(() => {
    const groupedIds = new Set<string>()
    const nodeToGroup = new Map<string, GroupDef>()
    for (const g of canvasGroups ?? []) {
      for (const mid of g.memberIds ?? []) {
        groupedIds.add(mid)
        nodeToGroup.set(mid, g)
      }
    }
    return { groupedIds, nodeToGroup }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupStructureKey])

  // Keep computed lookups in refs so drag callbacks can read current values
  // without including them in useCallback deps (which would cause re-creation)
  const groupedIdsRef = useRef(groupedIds)
  groupedIdsRef.current = groupedIds
  const nodeToGroupRef = useRef(nodeToGroup)
  nodeToGroupRef.current = nodeToGroup

  // Precompute group grids for position overrides and background nodes.
  // Keyed on groupStructureKey so it stays stable during position-only changes (group drag).
  const groupGrids = useMemo(() => {
    const grids = new Map<string, ReturnType<typeof computeGroupGrid>>()
    for (const g of canvasGroups ?? []) {
      grids.set(g.id, computeGroupGrid((g.memberIds ?? []).length, g.columns))
    }
    return grids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupStructureKey])

  return {
    groupedIds,
    nodeToGroup,
    groupedIdsRef,
    nodeToGroupRef,
    groupGrids,
  }
}
