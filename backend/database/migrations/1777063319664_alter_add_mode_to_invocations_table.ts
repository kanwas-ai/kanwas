import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'invocations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('mode').notNullable().defaultTo('thinking')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('mode')
    })
  }
}
