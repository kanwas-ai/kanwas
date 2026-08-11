const DEFAULT_CANVAS_ICON_CLASS_NAME = 'fa-solid fa-folder'

const TOP_LEVEL_CANVAS_ICON_CLASS_NAMES: Record<string, string> = {
  brain: 'fa-solid fa-brain',
  memory: 'fa-solid fa-brain',
  projects: 'fa-solid fa-diagram-project',
}

function normalizeCanvasName(name: string): string {
  return name.trim().toLowerCase()
}

export function getCanvasIconClassName(name: string, isTopLevelCanvas: boolean): string {
  if (!isTopLevelCanvas) {
    return DEFAULT_CANVAS_ICON_CLASS_NAME
  }

  return TOP_LEVEL_CANVAS_ICON_CLASS_NAMES[normalizeCanvasName(name)] ?? DEFAULT_CANVAS_ICON_CLASS_NAME
}
