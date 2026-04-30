import { tuyau } from './client'

export interface SummarizeResponse {
  title: string
  emoji: string
  summary: string
}

export interface SummarizeNodePayload {
  name: string
  content: string
  emoji?: string | null
  summary?: string | null
}

export const summarizeNode = async (
  workspaceId: string,
  nodeId: string,
  payload: SummarizeNodePayload
): Promise<SummarizeResponse> => {
  const response = await tuyau.workspaces({ id: workspaceId }).nodes({ nodeId }).summarize.$post(payload)
  if (response.error) {
    throw response.error
  }
  return response.data as SummarizeResponse
}
