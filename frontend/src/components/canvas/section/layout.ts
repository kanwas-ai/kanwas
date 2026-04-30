export {
  SECTION_CONTENT_GAP,
  SECTION_CLUSTER_GAP_X,
  SECTION_CLUSTER_GAP_Y,
  SECTION_DROP_ZONE_SCALE,
  SECTION_TITLE_FONT_FAMILY,
  SECTION_TITLE_FONT_SIZE,
  SECTION_TITLE_FONT_WEIGHT,
  SECTION_TITLE_HEIGHT,
  buildSectionLayouts,
  doBoundsIntersect,
  getSectionBounds,
  getSectionDropZoneBounds,
  getSectionNodeSize,
  isInsideSectionBounds,
  resolveSectionCollisionPositions,
  resolvePendingSectionPosition,
} from '@/lib/section-layout'

export type { SectionBounds, SectionLayoutSnapshot, SectionPositionUpdate } from '@/lib/section-layout'
