import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import type { Config } from '@japa/runner/types'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import StartAgent from '#listeners/start_agent'
import TrackInvocationUsage from '#listeners/track_invocation_usage'
import TrackWorkspaceViewed from '#listeners/track_workspace_viewed'
import GenerateSuggestedTasksAfterOnboarding from '#listeners/generate_suggested_tasks_after_onboarding'
import { SandboxRegistry } from '#services/sandbox_registry'
import WorkspaceDocumentService from '#services/workspace_document_service'
import YjsServerService from '#services/yjs_server_service'
import { fakeSandboxRegistry } from '#tests/mocks/sandbox_registry'
import { TrackedStartAgent, startAgentTracker } from '#tests/helpers/start_agent_tracker'
import { TrackedTrackInvocationUsage, invocationCompletedTracker } from '#tests/helpers/invocation_completed_tracker'
import MockWorkspaceDocumentService from '#tests/mocks/workspace_document_service'
import MockYjsServerService from '#tests/mocks/yjs_server_service'
import { clearMockYjsServerDocuments } from '#tests/mocks/yjs_server_document_store'

// Add this tag to a test when it must observe real commits.
const DB_TRANSACTION_OPT_OUT_TAG = '@db:commit'
const DB_TRANSACTION_ACTIVE_META_KEY = 'dbTransactionActive'

const hasTestMarker = (value: string | undefined) => {
  return Boolean(value && /(test|testing)/i.test(value))
}

const assertSafeTestDatabase = () => {
  const nodeEnv = env.get('NODE_ENV')
  const databaseUrl = env.get('DATABASE_URL')
  const databaseName = env.get('DB_DATABASE')

  if (nodeEnv !== 'test') {
    throw new Error(`[tests] Refusing to run because NODE_ENV is "${nodeEnv}". Expected "test" before migrations.`)
  }

  if (databaseUrl) {
    if (!hasTestMarker(databaseUrl)) {
      throw new Error(
        `[tests] Refusing to run because DATABASE_URL does not look like a test database: "${databaseUrl}"`
      )
    }

    return
  }

  if (!hasTestMarker(databaseName)) {
    throw new Error(
      `[tests] Refusing to run because DB_DATABASE is "${databaseName}". Use a test database name (for example "*_test").`
    )
  }
}

export class NoOpWorkspaceViewedListener {
  async handle() {}
}

export class NoOpSuggestedTasksAfterOnboardingListener {
  async handle() {}
}

/**
 * This file is imported by the "bin/test.ts" entrypoint file
 */

/**
 * Configure Japa plugins in the plugins array.
 * Learn more - https://japa.dev/docs/runner-config#plugins-optional
 */
export const plugins: Config['plugins'] = [assert(), apiClient(), pluginAdonisJS(app)]

/**
 * Configure lifecycle function to run before and after all the
 * tests.
 *
 * The setup functions are executed before all the tests
 * The teardown functions are executed after all the tests
 */
export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [
    () => assertSafeTestDatabase(),
    () => testUtils.db().migrate(),
    () => {
      app.container.swap(SandboxRegistry, () => {
        return fakeSandboxRegistry as unknown as SandboxRegistry
      })
    },
    () => {
      app.container.swap(StartAgent, () => app.container.make(TrackedStartAgent))
    },
    () => {
      app.container.swap(TrackInvocationUsage, () => app.container.make(TrackedTrackInvocationUsage))
    },
    () => {
      app.container.swap(
        TrackWorkspaceViewed,
        () => new NoOpWorkspaceViewedListener() as unknown as TrackWorkspaceViewed
      )
    },
    () => {
      app.container.swap(
        GenerateSuggestedTasksAfterOnboarding,
        () => new NoOpSuggestedTasksAfterOnboardingListener() as unknown as GenerateSuggestedTasksAfterOnboarding
      )
    },
    () => {
      app.container.swap(WorkspaceDocumentService, () => new MockWorkspaceDocumentService() as any)
    },
    () => {
      app.container.swap(YjsServerService, () => new MockYjsServerService() as any)
    },
  ],
  teardown: [
    () => {
      app.container.restore(StartAgent)
    },
    () => {
      app.container.restore(TrackInvocationUsage)
    },
    () => {
      app.container.restore(TrackWorkspaceViewed)
    },
    () => {
      app.container.restore(SandboxRegistry)
    },
    () => {
      app.container.restore(GenerateSuggestedTasksAfterOnboarding)
    },
    () => {
      app.container.restore(WorkspaceDocumentService)
    },
    () => {
      app.container.restore(YjsServerService)
    },
  ],
}

/**
 * Configure suites by tapping into the test suite instance.
 * Learn more - https://japa.dev/docs/test-suites#lifecycle-hooks
 */
export const configureSuite: Config['configureSuite'] = (suite) => {
  if (['browser', 'functional', 'e2e'].includes(suite.name)) {
    suite.setup(() => testUtils.httpServer().start())
  }

  const shouldUseGlobalTransaction = (test: { options: { tags: string[] } }) => {
    return ['unit', 'functional', 'e2e'].includes(suite.name) && !test.options.tags.includes(DB_TRANSACTION_OPT_OUT_TAG)
  }

  const setupPerTest = async (test: { options: { tags: string[]; meta: Record<string, unknown> } }) => {
    fakeSandboxRegistry.reset()
    clearMockYjsServerDocuments()

    if (!shouldUseGlobalTransaction(test)) {
      return
    }

    await db.beginGlobalTransaction()
    test.options.meta[DB_TRANSACTION_ACTIVE_META_KEY] = true
  }

  const teardownPerTest = async (test: { options: { meta: Record<string, unknown> } }) => {
    try {
      await startAgentTracker.flush()
      await invocationCompletedTracker.flush()
    } finally {
      if (test.options.meta[DB_TRANSACTION_ACTIVE_META_KEY]) {
        await db.rollbackGlobalTransaction()
        delete test.options.meta[DB_TRANSACTION_ACTIVE_META_KEY]
      }
    }
  }

  // Apply per-test hooks to tests inside groups
  suite.onGroup((group) => {
    group.each.setup(setupPerTest)
    group.each.teardown(teardownPerTest)
  })

  // Also cover top-level tests that are not inside groups
  suite.onTest((test) => {
    test.setup(setupPerTest)
    test.teardown(teardownPerTest)
  })
}
