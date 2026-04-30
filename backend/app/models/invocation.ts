import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasOne } from '@adonisjs/lucid/orm'
import Workspace from '#models/workspace'
import User from '#models/user'
import Task from '#models/task'
import type { BelongsTo, HasOne } from '@adonisjs/lucid/types/relations'
import type { AgentSocketMessage } from '#types/socketio'
import type { AgentMode } from '#agent/modes'

export interface UploadedFile {
  id: string
  filename: string
  path: string
  mimeType: string
  size: number
}

export default class Invocation extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare workspaceId: string

  @column()
  declare canvasId: string | null

  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  @column()
  declare userId: string

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @column()
  declare parentInvocationId: string | null

  @belongsTo(() => Invocation, {
    foreignKey: 'parentInvocationId',
  })
  declare parentInvocation: BelongsTo<typeof Invocation>

  @hasOne(() => Task, {
    foreignKey: 'rootInvocationId',
  })
  declare rootTask: HasOne<typeof Task>

  @hasOne(() => Task, {
    foreignKey: 'latestInvocationId',
  })
  declare latestTask: HasOne<typeof Task>

  @column()
  declare query: string

  @column()
  declare agentState: AgentSocketMessage | null

  @column({
    prepare: (value) => JSON.stringify(value ?? []),
  })
  declare files: UploadedFile[] | null

  @column()
  declare yoloMode: boolean

  @column()
  declare mode: AgentMode

  @column()
  declare source: string | null

  @column()
  declare snapshotCommitHash: string | null

  @column()
  declare agentRuntimeOwnerId: string | null

  @column.dateTime()
  declare agentStartedAt: DateTime | null

  @column.dateTime()
  declare agentLeaseExpiresAt: DateTime | null

  @column.dateTime()
  declare agentCancelRequestedAt: DateTime | null

  @column()
  declare agentCancelReason: string | null

  @column.dateTime()
  declare agentRecoveredAt: DateTime | null

  @column()
  declare agentRecoveryReason: string | null

  /**
   * Ephemeral property - not persisted to database.
   * Contains the text selection from an editor when the message was sent.
   */
  selectedText: { nodeId: string; nodeName: string; text: string } | null = null

  /**
   * Ephemeral property - not persisted to database.
   * Pre-computed workspace tree string from frontend (avoids a live Yjs connection).
   */
  workspaceTree: string | null = null

  /**
   * Ephemeral property - not persisted to database.
   * Pre-computed canvas path from frontend.
   */
  canvasPath: string | null = null

  /**
   * Ephemeral property - not persisted to database.
   * Pre-computed active canvas layout context from frontend.
   */
  activeCanvasContext: string | null = null

  /**
   * Ephemeral property - not persisted to database.
   * Pre-computed selected node paths from frontend.
   */
  selectedNodePaths: string[] | null = null

  /**
   * Ephemeral property - not persisted to database.
   * Pre-computed mentioned node paths from frontend.
   */
  mentionedNodePaths: string[] | null = null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
