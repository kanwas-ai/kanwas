import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.schema.raw(`
      ALTER TABLE public.llm_default_configs
        ADD COLUMN IF NOT EXISTS llm_service_tier character varying(255);
    `)
  }

  async down() {
    await this.schema.raw(`
      ALTER TABLE public.llm_default_configs
        DROP COLUMN IF EXISTS llm_service_tier;
    `)
  }
}
