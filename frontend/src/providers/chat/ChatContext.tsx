import { createContext, useContext } from 'react'
import type { AgentMode, ConversationItem } from 'backend/agent'

/**
 * Streaming data for a single timeline item.
 * Indexed by itemId in the streamingItems map.
 */
export interface StreamingData {
  type: 'chat' | 'thinking' | 'progress' | 'report_output' | 'tool'
  text: string
  subagentId?: string
  toolName?: string
  filePath?: string
  urls?: readonly string[]
  paths?: readonly string[]
  animationKey?: string
  command?: string
  markdownBody?: string
  objective?: string
  lineCount?: number
  contentLength?: number
  phase?: 'question_generation'
  lastUpdated: number
}

export type PanelView = 'tasks' | 'chat'

export interface ChatState {
  timeline: ConversationItem[]
  invocationId: string | null
  panelView: PanelView
  activeTaskId: string | null
  isHydratingTask: boolean
  agentMode: AgentMode
  yoloMode: boolean
  /** Streaming data indexed by timeline item ID (supports parallel streams) */
  streamingItems: Record<string, StreamingData>
}

export interface DerivedChatState {
  isProcessing: boolean
  hasPendingQuestion: boolean
}

interface ChatContextValue {
  state: ChatState
  derived: DerivedChatState
  clearPersistedState: () => Promise<void>
}

export const ChatContext = createContext<ChatContextValue | undefined>(undefined)

export const useChat = () => {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within ChatProvider')
  }
  return context
}
