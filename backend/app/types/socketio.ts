import type { AgentEvent, SerializedState } from '#agent/index'
import {
  SocketChannels,
  SocketClientEvents,
  SocketServerEvents,
  type TaskStatus,
  type TaskUpsertSocketMessage,
  type WorkspaceMessage,
} from '../../socketio.js'

export {
  SocketChannels,
  SocketClientEvents,
  SocketServerEvents,
  type TaskStatus,
  type TaskUpsertSocketMessage,
  type WorkspaceMessage,
}

/**
 * Socket.IO Event Names
 *
 * Centralized event names and types for Socket.IO communication between backend and frontend.
 * This ensures type safety and consistency across the application.
 */

/**
 * Client -> Server Events
 * Events emitted by the client to the server
 */
/** Agent message for real-time agent state updates */
export interface AgentSocketMessage {
  event: AgentEvent
  state: SerializedState
}

/**
 * Type definitions for event payloads
 */
export type SocketClientEventMap = {
  [SocketClientEvents.JOIN_ROOM]: string // channel name
  [SocketClientEvents.LEAVE_ROOM]: string // channel name
}

export type SocketServerEventMap = {
  [SocketServerEvents.AGENT_MESSAGE]: AgentSocketMessage
  [SocketServerEvents.AGENT_STREAMING]: AgentEvent
  [SocketServerEvents.WORKSPACE_MESSAGE]: WorkspaceMessage
  [SocketServerEvents.TASK_UPSERT]: TaskUpsertSocketMessage
}
