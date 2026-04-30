import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { z } from 'zod'
import Workspace from '#models/workspace'
import { resolveProviderFromUserConfig } from '#agent/providers/user_config'
import { LLM } from '#libs/llm'
import { ContextualLogger } from '#services/contextual_logger'
import UserConfigService from '#services/user_config_service'
import { summarizeNodeValidator } from '#validators/node_summary'

const DEFAULT_NAMES = new Set(['New Document', 'Untitled', 'Untitled Document'])

@inject()
export default class NodeSummaryController {
  constructor(protected userConfigService: UserConfigService) {}

  async summarize({ params, request, correlationId, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspace = await Workspace.findOrFail(params.id)
    const data = await request.validateUsing(summarizeNodeValidator)

    const logger = ContextualLogger.createFallback({
      component: 'NodeSummaryController',
      correlationId,
      userId: user.id,
      workspaceId: workspace.id,
    })

    const needsTitle = DEFAULT_NAMES.has(data.name)
    const needsSummary = !data.summary || !data.emoji

    if (!needsTitle && !needsSummary && data.summary && data.emoji) {
      return { title: data.name, emoji: data.emoji, summary: data.summary }
    }

    if (data.content.trim().length < 20) {
      return { title: data.name, emoji: '📝', summary: '' }
    }

    const userConfig = await this.userConfigService.getConfig(user.id)
    const provider = resolveProviderFromUserConfig(userConfig, {
      logger,
    })
    const llm = new LLM({
      provider,
      model: provider.modelTiers.small,
    })

    const result = await llm.complete(
      `Document title: ${data.name}\n\nContent:\n${data.content.slice(0, 2000)}`,
      `You generate a title, emoji, and short summary for a document card.

Title: A concise document title (2-5 words, Title Case). Describe the document's topic, not its format.
Emoji: A single emoji that best matches the topic. For documents about people/calls/meetings, use a person emoji.
Summary: A very short summary (5-8 words) describing the document's purpose, not quoting its content.`,
      z.object({
        title: z.string(),
        emoji: z.string(),
        summary: z.string(),
      })
    )

    return {
      title: needsTitle ? result.title : data.name,
      emoji: result.emoji,
      summary: result.summary,
    }
  }
}
