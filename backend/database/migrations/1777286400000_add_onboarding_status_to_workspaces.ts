import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'workspaces'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('onboarding_status').notNullable().defaultTo('completed')
    })

    this.schema.raw(`
      ALTER TABLE public.workspaces
        ADD CONSTRAINT workspaces_onboarding_status_check
        CHECK (onboarding_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'dismissed'::text]));

      ALTER TABLE public.workspaces
        ALTER COLUMN onboarding_status SET DEFAULT 'not_started';
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE public.workspaces
        DROP CONSTRAINT IF EXISTS workspaces_onboarding_status_check;
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('onboarding_status')
    })
  }
}
