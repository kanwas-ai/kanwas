export interface WorkspaceSuggestedTask {
  id: string
  emoji: string
  headline: string
  description: string
  prompt: string
  source?: string
}

export interface WorkspaceSuggestedTaskStatePayload {
  isLoading: boolean
  tasks: WorkspaceSuggestedTask[]
  generatedAt: string | null
  error: string | null
}
