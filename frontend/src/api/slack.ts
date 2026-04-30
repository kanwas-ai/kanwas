import { tuyau } from './client'

export interface SlackMessageData {
  userName: string
  userAvatar: string
  text: string
  timestamp: string
  permalink: string
  channel: string
  mentions: string
}

export async function fetchSlackMessage(workspaceId: string, permalink: string): Promise<SlackMessageData> {
  const response = await tuyau.workspaces({ id: workspaceId }).slack.message.$post({ permalink })
  if (response.error) {
    throw new Error((response.error as { error?: string })?.error || 'Failed to fetch Slack message')
  }
  return response.data as SlackMessageData
}
