import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import User from '#models/user'
import Invocation from '#models/invocation'

export const TASK_STATUSES = ['initiated', 'processing', 'waiting', 'complete', 'error'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskTerminalStatus = Extract<TaskStatus, 'complete' | 'error'>

export default class Task extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare workspaceId: string

  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  @column()
  declare userId: string

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @column()
  declare rootInvocationId: string

  @belongsTo(() => Invocation, {
    foreignKey: 'rootInvocationId',
  })
  declare rootInvocation: BelongsTo<typeof Invocation>

  @column()
  declare latestInvocationId: string

  @belongsTo(() => Invocation, {
    foreignKey: 'latestInvocationId',
  })
  declare latestInvocation: BelongsTo<typeof Invocation>

  @column()
  declare status: TaskStatus

  @column()
  declare title: string

  @column()
  declare description: string

  @column({
    prepare: (value: string[] | null) => JSON.stringify(value ?? []),
    consume: (value: unknown) => (Array.isArray(value) ? (value as string[]) : []),
  })
  declare modifiedFolders: string[]

  @column.dateTime()
  declare archivedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
