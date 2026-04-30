import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Waitlist extends BaseModel {
  static table = 'waitlist'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare email: string

  @column({ columnName: 'company_url' })
  declare companyUrl: string | null

  @column()
  declare role: string | null

  @column({ columnName: 'number_of_pms' })
  declare numberOfPms: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
