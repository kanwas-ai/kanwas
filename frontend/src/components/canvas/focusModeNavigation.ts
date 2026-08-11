export type FocusModeSupportedNodeType = 'blockNote'

export function isFocusModeSupportedNodeType(nodeType: string): nodeType is FocusModeSupportedNodeType {
  return nodeType === 'blockNote'
}

export function resolveFocusModeTargetAction(params: {
  focusMode: boolean
  focusedNodeId: string | null
  targetNodeId: string
  targetNodeType: string
}): { type: 'keep' } | { type: 'exit' } | { type: 'switch'; nodeType: FocusModeSupportedNodeType } {
  if (!params.focusMode || params.targetNodeId === params.focusedNodeId) {
    return { type: 'keep' }
  }

  if (isFocusModeSupportedNodeType(params.targetNodeType)) {
    return {
      type: 'switch',
      nodeType: params.targetNodeType,
    }
  }

  return { type: 'exit' }
}
