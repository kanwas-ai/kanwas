import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { WorkspaceSnapshotBundle } from 'shared'
import type { PortableWorkspaceTemplateAsset } from '#services/default_workspace_template_service'

export default class DefaultWorkspaceTemplate extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare version: number

  @column({
    prepare: (value: WorkspaceSnapshotBundle) => JSON.stringify(value),
    consume: (value: unknown) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as WorkspaceSnapshotBundle
      }

      return JSON.parse(String(value)) as WorkspaceSnapshotBundle
    },
  })
  declare snapshot: WorkspaceSnapshotBundle

  @column({
    prepare: (value: PortableWorkspaceTemplateAsset[] = []) => JSON.stringify(value),
    consume: (value: unknown) => {
      if (!value) {
        return []
      }

      if (Array.isArray(value)) {
        return value as PortableWorkspaceTemplateAsset[]
      }

      return JSON.parse(String(value)) as PortableWorkspaceTemplateAsset[]
    },
  })
  declare assets: PortableWorkspaceTemplateAsset[]

  @column()
  declare sourceWorkspaceId: string | null

  @column.dateTime()
  declare exportedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
