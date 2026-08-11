import { useCallback, useEffect, useRef } from 'react'
import type { CanvasItem } from 'shared'
import { buildSectionLayouts, resolveSectionCollisionPositions } from './layout'

const SECTION_COLLISION_SETTLE_MS = 500

type SectionResolutionSnapshot = {
  memberKey: string
  width: number
  height: number
}

function buildSectionResolutionSnapshot(canvas: CanvasItem): Map<string, SectionResolutionSnapshot> {
  const layouts = buildSectionLayouts(canvas)
  const snapshots = new Map<string, SectionResolutionSnapshot>()

  for (const section of canvas.sections ?? []) {
    const layout = layouts.get(section.id)
    if (!layout) {
      continue
    }

    snapshots.set(section.id, {
      memberKey: section.memberIds.join('\u0000'),
      width: layout.width,
      height: layout.height,
    })
  }

  return snapshots
}

export function useSectionCollisionResolution({
  canvas,
  mutableCanvas,
  isSectionDragging,
}: {
  canvas: CanvasItem
  mutableCanvas: CanvasItem
  isSectionDragging: boolean
}) {
  const previousSnapshotRef = useRef<Map<string, SectionResolutionSnapshot> | null>(null)
  const activeSectionIdsRef = useRef(new Set<string>())
  const deactivateTimeoutsRef = useRef(new Map<string, number>())

  const scheduleSectionDeactivation = useCallback((sectionId: string) => {
    const existingTimeout = deactivateTimeoutsRef.current.get(sectionId)
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    const timeoutId = window.setTimeout(() => {
      activeSectionIdsRef.current.delete(sectionId)
      deactivateTimeoutsRef.current.delete(sectionId)
    }, SECTION_COLLISION_SETTLE_MS)

    deactivateTimeoutsRef.current.set(sectionId, timeoutId)
  }, [])

  const activateSectionCollisionResolution = useCallback(
    (sectionId: string) => {
      activeSectionIdsRef.current.add(sectionId)
      scheduleSectionDeactivation(sectionId)
    },
    [scheduleSectionDeactivation]
  )

  useEffect(
    () => () => {
      for (const timeoutId of deactivateTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId)
      }
      deactivateTimeoutsRef.current.clear()
      activeSectionIdsRef.current.clear()
    },
    []
  )

  useEffect(() => {
    const currentSnapshot = buildSectionResolutionSnapshot(canvas)
    const previousSnapshot = previousSnapshotRef.current

    if (!previousSnapshot) {
      previousSnapshotRef.current = currentSnapshot
      return
    }

    const changedSectionIds = new Set(
      [...activeSectionIdsRef.current].filter((sectionId) => currentSnapshot.has(sectionId))
    )

    for (const [sectionId, currentSection] of currentSnapshot) {
      const previousSection = previousSnapshot.get(sectionId)
      if (previousSection && previousSection.memberKey !== currentSection.memberKey) {
        changedSectionIds.add(sectionId)
      }
    }

    for (const sectionId of [...changedSectionIds]) {
      const currentSection = currentSnapshot.get(sectionId)
      if (!currentSection) {
        activeSectionIdsRef.current.delete(sectionId)
        const timeoutId = deactivateTimeoutsRef.current.get(sectionId)
        if (timeoutId) {
          window.clearTimeout(timeoutId)
          deactivateTimeoutsRef.current.delete(sectionId)
        }
        continue
      }

      const previousSection = previousSnapshot.get(sectionId)
      if (!previousSection) {
        scheduleSectionDeactivation(sectionId)
        continue
      }

      const membershipChanged = previousSection.memberKey !== currentSection.memberKey
      const grew = currentSection.width > previousSection.width || currentSection.height > previousSection.height
      if (membershipChanged || grew) {
        activeSectionIdsRef.current.add(sectionId)
        scheduleSectionDeactivation(sectionId)
      } else {
        changedSectionIds.delete(sectionId)
      }
    }

    if (changedSectionIds.size === 0) {
      previousSnapshotRef.current = currentSnapshot
      return
    }

    if (isSectionDragging) {
      previousSnapshotRef.current = currentSnapshot
      return
    }

    const updates = resolveSectionCollisionPositions({
      canvas,
      changedSectionIds,
    })

    previousSnapshotRef.current = currentSnapshot

    if (updates.length === 0) {
      return
    }

    for (const update of updates) {
      const targetSection = mutableCanvas.sections?.find((section) => section.id === update.id)
      if (!targetSection) {
        continue
      }

      if (targetSection.position.x === update.position.x && targetSection.position.y === update.position.y) {
        continue
      }

      targetSection.position = update.position
    }
  }, [canvas, isSectionDragging, mutableCanvas, scheduleSectionDeactivation])

  return {
    activateSectionCollisionResolution,
  }
}
