import { describe, expect, it } from 'vitest'
import type { ChatState } from '@/providers/chat'
import { getDerivedChatState } from '@/providers/chat/derived'

function createSnapshot(overrides: Partial<Pick<ChatState, 'timeline' | 'streamingItems'>>) {
  return {
    timeline: overrides.timeline ?? [],
    streamingItems: overrides.streamingItems ?? {},
  }
}

describe('chat derived state', () => {
  it('keeps processing active for a mid-run assistant chat item', () => {
    const derived = getDerivedChatState(
      createSnapshot({
        timeline: [
          {
            id: 'chat_1',
            type: 'chat',
            message: "I've got your context loaded. What should I chew on?",
            timestamp: Date.now(),
          },
        ],
      })
    )

    expect(derived).toEqual({ isProcessing: true, hasPendingQuestion: false })
  })

  it('stops processing when a question is pending', () => {
    const derived = getDerivedChatState(
      createSnapshot({
        timeline: [
          {
            id: 'ask_1',
            type: 'ask_question',
            questions: [],
            status: 'pending',
            timestamp: Date.now(),
            agent: { source: 'main' },
          },
        ],
      })
    )

    expect(derived).toEqual({ isProcessing: false, hasPendingQuestion: true })
  })

  it('treats active streaming items as processing while a run is still underway', () => {
    const derived = getDerivedChatState(
      createSnapshot({
        streamingItems: {
          ask_1: {
            type: 'tool',
            text: '',
            toolName: 'ask_question',
            lastUpdated: Date.now(),
          },
        },
      })
    )

    expect(derived).toEqual({ isProcessing: true, hasPendingQuestion: false })
  })
})
