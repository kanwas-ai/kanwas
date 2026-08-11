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
 * Type definitions for event payloads
 */
export type SocketClientEventMap = {
  [SocketClientEvents.JOIN_ROOM]: string // channel name
  [SocketClientEvents.LEAVE_ROOM]: string // channel name
}

export type SocketServerEventMap = {
  [SocketServerEvents.WORKSPACE_MESSAGE]: WorkspaceMessage
  [SocketServerEvents.TASK_UPSERT]: TaskUpsertSocketMessage
}
