import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { LlmProviderName } from 'shared/llm-config'

export default class LlmDefaultConfig extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare llmProvider: LlmProviderName | null

  @column()
  declare llmModel: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
