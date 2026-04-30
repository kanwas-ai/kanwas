export const SocketClientEvents = {
  JOIN_ROOM: 'socketio:join',
  LEAVE_ROOM: 'socketio:leave',
} as const

export const SocketServerEvents = {
  AGENT_MESSAGE: 'socketio:agent:message',
  AGENT_STREAMING: 'socketio:agent:streaming',
  WORKSPACE_MESSAGE: 'socketio:workspace:message',
  TASK_UPSERT: 'socketio:task:upsert',
} as const

export const SocketChannels = {
  agentEvents: (invocationId: string) => `agent/${invocationId}/events`,
  agentCommands: (invocationId: string) => `agent/${invocationId}/commands`,
  workspaceEvents: (workspaceId: string) => `workspaces/${workspaceId}`,
  taskEvents: (workspaceId: string, userId: string) => `workspaces/${workspaceId}/users/${userId}/tasks`,
} as const

export type WorkspaceMessage = {
  type: 'workspace_rewound'
  commitHash: string
}

export const TASK_STATUSES = ['initiated', 'processing', 'waiting', 'complete', 'error'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface TaskUpsertSocketMessage {
  taskId: string
  rootInvocationId: string
  latestInvocationId: string
  status: TaskStatus
  modifiedFolders: string[]
  updatedAt: string
}
