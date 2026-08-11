import type { AudioNodeData, FileNodeData, ImageNodeData, NodeItem, XyNode } from '../types.js'
import { getExtensionFromMimeType } from './binary-types.js'

type NodeLike = Pick<NodeItem, 'xynode'> | XyNode

function getNodeData(node: NodeLike): XyNode['data'] {
  return 'xynode' in node ? node.xynode.data : node.data
}

function getNodeType(node: NodeLike): XyNode['type'] {
  return 'xynode' in node ? node.xynode.type : node.type
}

export function getNodeFilesystemExtension(node: NodeLike): string {
  const nodeType = getNodeType(node)

  if (nodeType === 'blockNote') {
    return '.md'
  }

  if (nodeType === 'link') {
    return '.url.yaml'
  }

  if (nodeType === 'text') {
    return '.text.yaml'
  }

  if (nodeType === 'stickyNote') {
    return '.sticky.yaml'
  }

  const data = getNodeData(node) as ImageNodeData | FileNodeData | AudioNodeData
  const ext = getExtensionFromMimeType(data.mimeType) || 'bin'
  return `.${ext}`
}
