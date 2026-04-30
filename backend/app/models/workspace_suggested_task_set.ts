import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import type { WorkspaceSuggestedTask } from '#types/workspace_suggested_task'

export default class WorkspaceSuggestedTaskSet extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare workspaceId: string

  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  @column()
  declare isLoading: boolean

  @column({
    prepare: (value: WorkspaceSuggestedTask[] | null) => JSON.stringify(value ?? []),
    consume: (value: unknown) => (Array.isArray(value) ? (value as WorkspaceSuggestedTask[]) : []),
  })
  declare tasks: WorkspaceSuggestedTask[]

  @column()
  declare errorMessage: string | null

  @column.dateTime()
  declare generatedAt: DateTime | null

  @column.dateTime()
  declare loadingStartedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
