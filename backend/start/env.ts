/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  APP_NAME: Env.schema.string(),
  HOST: Env.schema.string(),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DATABASE_URL: Env.schema.string.optional(),
  DB_HOST: Env.schema.string.optional(),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string.optional(),

  REDIS_USER: Env.schema.string.optional(),
  REDIS_HOST: Env.schema.string(),
  REDIS_PORT: Env.schema.number(),
  REDIS_PASSWORD: Env.schema.string.optional(),

  PARALLEL_API_KEY: Env.schema.string(),
  COMPOSIO_API_KEY: Env.schema.string(),
  ANTHROPIC_API_KEY: Env.schema.string.optional(),
  OPENAI_API_KEY: Env.schema.string.optional(),
  OPENAI_BASE_URL: Env.schema.string.optional(),
  GROQ_API_KEY: Env.schema.string.optional(),

  POSTHOG_QUERY_API_KEY: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for API authentication
  |----------------------------------------------------------
  */
  API_SECRET: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for Google OAuth
  |----------------------------------------------------------
  */
  GOOGLE_CLIENT_ID: Env.schema.string.optional(),
  GOOGLE_CLIENT_SECRET: Env.schema.string.optional(),
  GOOGLE_REDIRECT_URI: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for Sentry configuration
  |----------------------------------------------------------
  */
  SENTRY_DSN: Env.schema.string.optional(),
  SANDBOX_SENTRY_DSN: Env.schema.string.optional(),
  SANDBOX_E2B_TEMPLATE_ID: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for Yjs server
  |----------------------------------------------------------
  */
  YJS_SERVER_HOST: Env.schema.string.optional(),
  YJS_SERVER_PROTOCOL: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the drive package
  |----------------------------------------------------------
  */
  DRIVE_DISK: Env.schema.enum(['fs', 'r2'] as const),
  R2_KEY: Env.schema.string.optional(),
  R2_SECRET: Env.schema.string.optional(),
  R2_BUCKET: Env.schema.string.optional(),
  R2_ENDPOINT: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Slack Webhook for notifications
  |----------------------------------------------------------
  */
  SLACK_WEBHOOK_URL: Env.schema.string.optional(),
})
