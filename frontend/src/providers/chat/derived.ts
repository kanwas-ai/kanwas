import type { ChatState, DerivedChatState } from './ChatContext'

interface TimelineItemSummary {
  type: string
  status?: string
}

interface DerivedChatStateInput {
  timeline: ReadonlyArray<TimelineItemSummary>
  streamingItems: Readonly<ChatState['streamingItems']>
}

export function getDerivedChatState(snapshot: DerivedChatStateInput): DerivedChatState {
  const hasPendingQuestion = snapshot.timeline.some(
    (item) => item.type === 'ask_question' && 'status' in item && item.status === 'pending'
  )

  let isProcessing = false
  if (snapshot.timeline.length > 0 || Object.keys(snapshot.streamingItems).length > 0) {
    const last = snapshot.timeline[snapshot.timeline.length - 1]
    const hasCompleted = last && (last.type === 'execution_completed' || last.type === 'error')

    if (!hasCompleted && !hasPendingQuestion) {
      isProcessing = true
    }
  }

  return { isProcessing, hasPendingQuestion }
}
