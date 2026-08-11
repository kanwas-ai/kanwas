export type ToolKind = 'document' | 'text' | 'sticky' | 'image' | 'file' | 'audio' | 'link' | 'section'

export interface ToolDef {
  kind: ToolKind
  icon: string
  label: string
}

export type FlowPosition = { x: number; y: number }

export const DRAG_THRESHOLD_PX = 5

export const PRIMARY_TOOLS: ToolDef[] = [
  { kind: 'document', icon: 'fa-file-lines', label: 'Document' },
  { kind: 'sticky', icon: 'fa-note-sticky', label: 'Sticky note' },
  { kind: 'text', icon: 'fa-font', label: 'Text' },
  { kind: 'link', icon: 'fa-link', label: 'Link' },
]

export const MORE_TOOLS: ToolDef[] = [
  { kind: 'section', icon: 'fa-rectangle-list', label: 'Create section' },
  { kind: 'image', icon: 'fa-image', label: 'Image' },
  { kind: 'file', icon: 'fa-file', label: 'File' },
  { kind: 'audio', icon: 'fa-volume-high', label: 'Audio' },
]

export const ALL_TOOLS = [...PRIMARY_TOOLS, ...MORE_TOOLS]
