import { describe, expect, it } from 'vitest'
import { isFocusModeSupportedNodeType, resolveFocusModeTargetAction } from '@/components/canvas/focusModeNavigation'

describe('focus mode navigation', () => {
  it('recognizes supported focus mode node types', () => {
    expect(isFocusModeSupportedNodeType('blockNote')).toBe(true)
    expect(isFocusModeSupportedNodeType('image')).toBe(false)
  })

  it('switches focus mode when selecting a different supported document', () => {
    expect(
      resolveFocusModeTargetAction({
        focusMode: true,
        focusedNodeId: 'node-1',
        targetNodeId: 'node-2',
        targetNodeType: 'blockNote',
      })
    ).toEqual({ type: 'switch', nodeType: 'blockNote' })
  })

  it('exits focus mode when selecting a different unsupported node', () => {
    expect(
      resolveFocusModeTargetAction({
        focusMode: true,
        focusedNodeId: 'node-1',
        targetNodeId: 'node-2',
        targetNodeType: 'image',
      })
    ).toEqual({ type: 'exit' })
  })

  it('keeps focus mode state for the currently focused node', () => {
    expect(
      resolveFocusModeTargetAction({
        focusMode: true,
        focusedNodeId: 'node-1',
        targetNodeId: 'node-1',
        targetNodeType: 'blockNote',
      })
    ).toEqual({ type: 'keep' })
  })

  it('does nothing special when focus mode is inactive', () => {
    expect(
      resolveFocusModeTargetAction({
        focusMode: false,
        focusedNodeId: null,
        targetNodeId: 'node-2',
        targetNodeType: 'image',
      })
    ).toEqual({ type: 'keep' })
  })
})
