import { defineConfig } from '@adonisjs/core/app'

export default defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Experimental flags
  |--------------------------------------------------------------------------
  |
  | The following features will be enabled by default in the next major release
  | of AdonisJS. You can opt into them today to avoid any breaking changes
  | during upgrade.
  |
  */
  experimental: {
    mergeMultipartFieldsAndFiles: true,
    shutdownInReverseOrder: true,
  },

  /*
  |--------------------------------------------------------------------------
  | Commands
  |--------------------------------------------------------------------------
  |
  | List of ace commands to register from packages. The application commands
  | will be scanned automatically from the "./commands" directory.
  |
  */
  commands: [
    () => import('@adonisjs/core/commands'),
    () => import('@adonisjs/lucid/commands'),
    () => import('@tuyau/core/commands'),
    () => import('adonisjs-scheduler/commands'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Service providers
  |--------------------------------------------------------------------------
  |
  | List of service providers to import and register when booting the
  | application
  |
  */
  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/hash_provider'),
    {
      file: () => import('@adonisjs/core/providers/repl_provider'),
      environment: ['repl', 'test'],
    },
    () => import('@adonisjs/core/providers/vinejs_provider'),
    () => import('@adonisjs/cors/cors_provider'),
    () => import('@adonisjs/lucid/database_provider'),
    () => import('@adonisjs/auth/auth_provider'),
    () => import('@tuyau/core/tuyau_provider'),
    () => import('@adonisjs/redis/redis_provider'),
    () => import('@adonisjs/cache/cache_provider'),
    () => import('@adonisjs/lock/lock_provider'),
    {
      file: () => import('adonisjs-scheduler/scheduler_provider'),
      environment: ['web', 'console'],
    },
    () => import('#providers/app_provider'),
    {
      file: () => import('#providers/socketio_provider'),
      environment: ['web'],
    },
    {
      file: () => import('#providers/scheduler_worker_provider'),
      environment: ['web'],
    },
    () => import('#providers/sentry_provider'),
    () => import('@adonisjs/drive/drive_provider'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Preloads
  |--------------------------------------------------------------------------
  |
  | List of modules to import before starting the application.
  |
  */
  preloads: [
    () => import('#start/validate_env'),
    () => import('#start/routes'),
    () => import('#start/kernel'),
    () => import('#start/events'),
    {
      file: () => import('#start/scheduler'),
      environment: ['web', 'console'],
    },
  ],

  /*
  |--------------------------------------------------------------------------
  | Tests
  |--------------------------------------------------------------------------
  |
  | List of test suites to organize tests by their type. Feel free to remove
  | and add additional suites.
  |
  */
  tests: {
    suites: [
      {
        files: ['tests/unit/**/*.spec(.ts|.js)'],
        name: 'unit',
        timeout: 2000,
      },
      {
        files: ['tests/functional/**/*.spec(.ts|.js)'],
        name: 'functional',
        timeout: 30000,
      },
      {
        files: ['tests/agent/**/*.spec(.ts|.js)'],
        name: 'agent',
        timeout: 30000,
      },
    ],
    forceExit: false,
  },

  /*
  |--------------------------------------------------------------------------
  | Meta files
  |--------------------------------------------------------------------------
  |
  | Additional files to copy to the build directory during production build
  |
  */
  metaFiles: [
    {
      pattern: 'libs/agent/prompts/**/*.md',
      reloadServer: false,
    },
    {
      pattern: 'libs/templates/**/*.md',
      reloadServer: false,
    },  ],
})
