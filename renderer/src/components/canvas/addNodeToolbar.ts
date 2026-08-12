export type ToolKind = 'document' | 'text' | 'sticky' | 'image' | 'file' | 'audio' | 'link' | 'section'

export interface ToolDef {
  kind: ToolKind
  icon: string
  iconStyle: 'regular' | 'solid'
  label: string
}

export type FlowPosition = { x: number; y: number }

export const DRAG_THRESHOLD_PX = 5

export const PRIMARY_TOOLS: ToolDef[] = [
  { kind: 'document', icon: 'fa-file-lines', iconStyle: 'regular', label: 'Document' },
  { kind: 'sticky', icon: 'fa-note-sticky', iconStyle: 'regular', label: 'Sticky note' },
  { kind: 'text', icon: 'fa-font', iconStyle: 'solid', label: 'Text' },
  { kind: 'link', icon: 'fa-link', iconStyle: 'solid', label: 'Link' },
]

export const MORE_TOOLS: ToolDef[] = [
  { kind: 'section', icon: 'fa-rectangle-list', iconStyle: 'regular', label: 'Create section' },
  { kind: 'image', icon: 'fa-image', iconStyle: 'regular', label: 'Image' },
  { kind: 'file', icon: 'fa-file', iconStyle: 'regular', label: 'File' },
  { kind: 'audio', icon: 'fa-volume-high', iconStyle: 'solid', label: 'Audio' },
]

export const ALL_TOOLS = [...PRIMARY_TOOLS, ...MORE_TOOLS]
