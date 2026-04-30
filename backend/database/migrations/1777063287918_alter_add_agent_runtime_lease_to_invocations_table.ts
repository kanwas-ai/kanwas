import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'invocations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('agent_runtime_owner_id').nullable()
      table.timestamp('agent_started_at', { useTz: true }).nullable()
      table.timestamp('agent_lease_expires_at', { useTz: true }).nullable()
      table.timestamp('agent_cancel_requested_at', { useTz: true }).nullable()
      table.text('agent_cancel_reason').nullable()
      table.timestamp('agent_recovered_at', { useTz: true }).nullable()
      table.string('agent_recovery_reason').nullable()

      table.index(['agent_runtime_owner_id'], 'invocations_agent_runtime_owner_idx')
      table.index(['agent_lease_expires_at'], 'invocations_agent_lease_expires_idx')
      table.index(['agent_cancel_requested_at'], 'invocations_agent_cancel_requested_idx')
      table.index(['agent_recovered_at'], 'invocations_agent_recovered_idx')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['agent_runtime_owner_id'], 'invocations_agent_runtime_owner_idx')
      table.dropIndex(['agent_lease_expires_at'], 'invocations_agent_lease_expires_idx')
      table.dropIndex(['agent_cancel_requested_at'], 'invocations_agent_cancel_requested_idx')
      table.dropIndex(['agent_recovered_at'], 'invocations_agent_recovered_idx')

      table.dropColumn('agent_runtime_owner_id')
      table.dropColumn('agent_started_at')
      table.dropColumn('agent_lease_expires_at')
      table.dropColumn('agent_cancel_requested_at')
      table.dropColumn('agent_cancel_reason')
      table.dropColumn('agent_recovered_at')
      table.dropColumn('agent_recovery_reason')
    })
  }
}
