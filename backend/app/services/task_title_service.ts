import { inject } from '@adonisjs/core'
import { resolveProviderFromUserConfig } from '#agent/providers/user_config'
import { LLM } from '#libs/llm'
import { ContextualLogger } from '#services/contextual_logger'
import TaskLifecycleService, { DEFAULT_TASK_TITLE } from '#services/task_lifecycle_service'
import UserConfigService from '#services/user_config_service'

const TITLE_TIMEOUT_MS = 5000
const MAX_TITLE_LENGTH = 80
const MAX_PROMPT_LENGTH = 1200

@inject()
export default class TaskTitleService {
  constructor(
    private taskLifecycleService: TaskLifecycleService,
    private userConfigService: UserConfigService
  ) {}

  private logger = ContextualLogger.createFallback({ component: 'TaskTitleService' })

  generateTitleInBackground(taskId: string, userId: string, rootMessage: string): void {
    if (process.env.NODE_ENV === 'test') {
      return
    }

    const trimmedMessage = rootMessage.trim()
    if (!trimmedMessage) {
      return
    }

    void this.generateAndPersist(taskId, userId, trimmedMessage).catch((error) => {
      this.logger.warn(
        {
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to generate task title with LLM'
      )
    })
  }

  private async generateAndPersist(taskId: string, userId: string, rootMessage: string): Promise<void> {
    const userConfig = await this.userConfigService.getConfig(userId)
    const provider = resolveProviderFromUserConfig(userConfig, {
      logger: this.logger,
    })
    const llm = new LLM({
      provider,
      model: provider.modelTiers.small,
    })

    const prompt = rootMessage.slice(0, MAX_PROMPT_LENGTH)

    const rawTitle = await llm.completeText({
      systemPrompt:
        'You generate concise task titles. Return only one title in 2-5 words. Use plain text, no punctuation wrappers, no quotes.',
      prompt: `User request:\n${prompt}`,
      abortSignal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
    })

    const title = this.normalizeTitle(rawTitle)
    if (!title || title === DEFAULT_TASK_TITLE) {
      return
    }

    await this.taskLifecycleService.updateTitleIfDefault(taskId, title)
  }

  private normalizeTitle(rawTitle: string): string | null {
    const firstLine = rawTitle.split('\n')[0] ?? ''
    const withoutLabel = firstLine.replace(/^title\s*[:\-]\s*/i, '')
    const withoutWrapping = withoutLabel.replace(/^["'`\s]+|["'`\s]+$/g, '')
    const compact = withoutWrapping.replace(/\s+/g, ' ').trim()

    if (!compact) {
      return null
    }

    return compact.slice(0, MAX_TITLE_LENGTH)
  }
}
