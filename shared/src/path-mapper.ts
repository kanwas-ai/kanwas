// Browser-safe path mapper export for frontend/runtime usage.
// Intentionally excludes server-only utilities like ContentConverter.

export { PathMapper, makeUniqueName } from './workspace/path-mapper.js'
export type { PathMapping, CanvasMapping } from './workspace/path-mapper.js'

export type {
  WorkspaceDocument,
  CanvasItem,
  NodeItem,
  BlockNoteNode,
  ImageNode,
  FileNode,
  AudioNode,
  LinkNode,
  XyNode,
} from './types.js'
