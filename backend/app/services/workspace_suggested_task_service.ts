import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import WorkspaceSuggestedTaskSet from '#models/workspace_suggested_task_set'
import type { WorkspaceSuggestedTask } from '#types/workspace_suggested_task'
import { WORKSPACE_ONBOARDING_PROMPT } from '#types/workspace_onboarding'

export const WORKSPACE_SUGGESTED_TASK_LOADING_TIMEOUT_MS = 5 * 60 * 1000
export const WORKSPACE_SUGGESTED_TASK_STALE_ERROR = 'Suggested task generation timed out before completion'

export interface WorkspaceSuggestedTaskState {
  isLoading: boolean
  tasks: WorkspaceSuggestedTask[]
  generatedAt: DateTime | null
  error: string | null
}

export type WorkspaceSuggestedTaskGenerationCompleteResult = {
  status: 'completed' | 'missing' | 'not_loading'
}

export type WorkspaceSuggestedTaskGenerationFailureResult = {
  status: 'failed' | 'missing' | 'not_loading'
}

export type WorkspaceSuggestedTaskGenerationBeginResult = {
  status: 'started' | 'already_loading' | 'already_generated'
}

export type WorkspaceSuggestedTaskOnboardingReplaceResult = {
  status: 'replaced' | 'already_loading' | 'already_generated'
}

@inject()
export default class WorkspaceSuggestedTaskService {
  buildDefaultState(): WorkspaceSuggestedTaskState {
    return {
      isLoading: false,
      tasks: [],
      generatedAt: null,
      error: null,
    }
  }

  async seedOnboardingTask(workspaceId: string, trx: TransactionClientContract): Promise<void> {
    const existing = await WorkspaceSuggestedTaskSet.query({ client: trx }).where('workspace_id', workspaceId).first()
    if (existing) {
      return
    }

    const onboardingTask: WorkspaceSuggestedTask = {
      id: randomUUID(),
      emoji: '👋',
      headline: "Let's make this workspace yours",
      description:
        "Your context is why Kanwas is a powerful space to think in. Let's have a quick chat so I can get to know you.",
      prompt: WORKSPACE_ONBOARDING_PROMPT,
      source: 'onboarding',
    }

    await WorkspaceSuggestedTaskSet.create(
      {
        workspaceId,
        isLoading: false,
        tasks: [onboardingTask],
        errorMessage: null,
        generatedAt: null,
        loadingStartedAt: null,
      },
      { client: trx }
    )
  }

  async ensureInitialLoadingState(workspaceId: string, trx: TransactionClientContract): Promise<void> {
    const existing = await WorkspaceSuggestedTaskSet.query({ client: trx }).where('workspace_id', workspaceId).first()
    if (existing) {
      return
    }

    await WorkspaceSuggestedTaskSet.create(
      {
        workspaceId,
        isLoading: true,
        tasks: [],
        errorMessage: null,
        generatedAt: null,
        loadingStartedAt: DateTime.utc(),
      },
      { client: trx }
    )
  }

  async getState(workspaceId: string): Promise<WorkspaceSuggestedTaskState> {
    return db.transaction(async (trx) => {
      const record = await WorkspaceSuggestedTaskSet.query({ client: trx })
        .where('workspace_id', workspaceId)
        .forUpdate()
        .first()

      if (!record) {
        return this.buildDefaultState()
      }

      await this.clearStaleLoadingIfNeeded(record)
      return this.serialize(record)
    })
  }

  async deleteSuggestion(workspaceId: string, suggestionId: string): Promise<WorkspaceSuggestedTaskState> {
    return db.transaction(async (trx) => {
      const record = await WorkspaceSuggestedTaskSet.query({ client: trx })
        .where('workspace_id', workspaceId)
        .forUpdate()
        .first()

      if (!record) {
        return this.buildDefaultState()
      }

      await this.clearStaleLoadingIfNeeded(record)

      if (record.isLoading) {
        return this.serialize(record)
      }

      const nextTasks = record.tasks.filter((task) => task.id !== suggestionId)
      if (nextTasks.length !== record.tasks.length) {
        record.tasks = nextTasks
        await record.save()
      }

      return this.serialize(record)
    })
  }

  async replaceTasksFromOnboarding(
    workspaceId: string,
    tasks: WorkspaceSuggestedTask[]
  ): Promise<WorkspaceSuggestedTaskOnboardingReplaceResult> {
    return db.transaction(async (trx) => {
      const record = await WorkspaceSuggestedTaskSet.query({ client: trx })
        .where('workspace_id', workspaceId)
        .forUpdate()
        .first()

      if (record) {
        await this.clearStaleLoadingIfNeeded(record)

        if (record.generatedAt) {
          return { status: 'already_generated' }
        }

        if (record.isLoading) {
          return { status: 'already_loading' }
        }

        record.tasks = tasks
        record.isLoading = false
        record.errorMessage = null
        record.generatedAt = DateTime.utc()
        record.loadingStartedAt = null
        await record.save()

        return { status: 'replaced' }
      }

      await WorkspaceSuggestedTaskSet.create(
        {
          workspaceId,
          isLoading: false,
          tasks,
          errorMessage: null,
          generatedAt: DateTime.utc(),
          loadingStartedAt: null,
        },
        { client: trx }
      )

      return { status: 'replaced' }
    })
  }

  async beginGeneration(workspaceId: string): Promise<WorkspaceSuggestedTaskGenerationBeginResult> {
    return db.transaction(async (trx) => {
      const record = await WorkspaceSuggestedTaskSet.query({ client: trx })
        .where('workspace_id', workspaceId)
        .forUpdate()
        .first()

      if (record) {
        await this.clearStaleLoadingIfNeeded(record)

        if (record.generatedAt) {
          return { status: 'already_generated' }
        }

        if (record.isLoading) {
          return { status: 'already_loading' }
        }

        record.isLoading = true
        record.tasks = []
        record.errorMessage = null
        record.generatedAt = null
        record.loadingStartedAt = DateTime.utc()
        await record.save()

        return { status: 'started' }
      }

      await WorkspaceSuggestedTaskSet.create(
        {
          workspaceId,
          isLoading: true,
          tasks: [],
          errorMessage: null,
          generatedAt: null,
          loadingStartedAt: DateTime.utc(),
        },
        { client: trx }
      )

      return { status: 'started' }
    })
  }

  async completeGeneration(
    workspaceId: string,
    tasks: WorkspaceSuggestedTask[]
  ): Promise<WorkspaceSuggestedTaskGenerationCompleteResult> {
    return db.transaction(async (trx) => {
      const record = await WorkspaceSuggestedTaskSet.query({ client: trx })
        .where('workspace_id', workspaceId)
        .forUpdate()
        .first()

      if (!record) {
        return { status: 'missing' }
      }

      if (!record.isLoading) {
        return { status: 'not_loading' }
      }

      record.tasks = tasks
      record.isLoading = false
      record.errorMessage = null
      record.generatedAt = DateTime.utc()
      record.loadingStartedAt = null
      await record.save()

      return { status: 'completed' }
    })
  }

  async failGeneration(
    workspaceId: string,
    errorMessage: string
  ): Promise<WorkspaceSuggestedTaskGenerationFailureResult> {
    return db.transaction(async (trx) => {
      const record = await WorkspaceSuggestedTaskSet.query({ client: trx })
        .where('workspace_id', workspaceId)
        .forUpdate()
        .first()

      if (!record) {
        return { status: 'missing' }
      }

      if (!record.isLoading) {
        return { status: 'not_loading' }
      }

      record.tasks = []
      record.isLoading = false
      record.errorMessage = errorMessage
      record.generatedAt = null
      record.loadingStartedAt = null
      await record.save()

      return { status: 'failed' }
    })
  }

  private serialize(record: WorkspaceSuggestedTaskSet): WorkspaceSuggestedTaskState {
    return {
      isLoading: record.isLoading,
      tasks: Array.isArray(record.tasks) ? record.tasks : [],
      generatedAt: record.generatedAt ?? null,
      error: record.errorMessage ?? null,
    }
  }

  private async clearStaleLoadingIfNeeded(record: WorkspaceSuggestedTaskSet): Promise<boolean> {
    if (!this.isLoadingStale(record)) {
      return false
    }

    record.isLoading = false
    record.tasks = []
    record.errorMessage = WORKSPACE_SUGGESTED_TASK_STALE_ERROR
    record.generatedAt = null
    record.loadingStartedAt = null
    await record.save()

    return true
  }

  private isLoadingStale(record: WorkspaceSuggestedTaskSet): boolean {
    if (!record.isLoading) {
      return false
    }

    const loadingStartedAt = record.loadingStartedAt ?? record.createdAt
    return DateTime.utc().toMillis() - loadingStartedAt.toMillis() > WORKSPACE_SUGGESTED_TASK_LOADING_TIMEOUT_MS
  }
}
