import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.schema.raw(`
      ALTER TABLE public.default_workspace_templates
        ADD COLUMN IF NOT EXISTS assets jsonb NOT NULL DEFAULT '[]'::jsonb;
    `)
  }

  async down() {
    await this.schema.raw(`
      ALTER TABLE public.default_workspace_templates
        DROP COLUMN IF EXISTS assets;
    `)
  }
}
