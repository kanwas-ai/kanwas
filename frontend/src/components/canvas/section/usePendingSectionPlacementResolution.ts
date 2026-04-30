import { useEffect } from 'react'
import type { CanvasItem } from 'shared'
import { buildSectionLayouts, resolvePendingSectionPosition } from './layout'

export function resolvePendingSectionPlacements(mutableCanvas: CanvasItem, canvas: CanvasItem): boolean {
  const sections = mutableCanvas.sections ?? []
  if (!sections.some((section) => section.pendingPlacement)) {
    return false
  }

  const sectionLayouts = buildSectionLayouts(canvas)
  let resolvedAny = false

  for (let pass = 0; pass < sections.length; pass += 1) {
    let resolvedInPass = false

    for (const section of sections) {
      const pendingPlacement = section.pendingPlacement
      if (!pendingPlacement) {
        continue
      }

      const anchorSection = sections.find((candidate) => candidate.title === pendingPlacement.anchorSectionTitle)
      if (!anchorSection || anchorSection.id === section.id || anchorSection.pendingPlacement) {
        continue
      }

      const anchorLayout = sectionLayouts.get(anchorSection.id)
      if (!anchorLayout) {
        continue
      }

      const nextPosition = resolvePendingSectionPosition({ pendingPlacement, anchorSection, anchorLayout })
      const positionChanged = section.position.x !== nextPosition.x || section.position.y !== nextPosition.y

      if (!positionChanged && section.pendingPlacement === undefined) {
        continue
      }

      section.position = nextPosition
      delete section.pendingPlacement
      resolvedInPass = true
      resolvedAny = true
    }

    if (!resolvedInPass) {
      break
    }
  }

  return resolvedAny
}

export function usePendingSectionPlacementResolution({
  canvas,
  mutableCanvas,
}: {
  canvas: CanvasItem
  mutableCanvas: CanvasItem
}) {
  useEffect(() => {
    resolvePendingSectionPlacements(mutableCanvas, canvas)
  }, [canvas, mutableCanvas])
}
