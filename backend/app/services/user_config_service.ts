import type { ProviderName, ProviderReasoningEffort } from '#agent/providers/types'
import LlmDefaultConfigService, { resolveEffectiveLlmConfig } from '#services/llm_default_config_service'
import UserConfig from '#models/user_config'

export interface GlobalUserConfig {
  dismissedTipIds?: string[]
  llmProvider?: ProviderName | null
  llmModel?: string | null
  reasoningEffort?: ProviderReasoningEffort | null
}

const DEFAULTS: GlobalUserConfig = {}

export default class UserConfigService {
  private globalQuery(userId: string) {
    return UserConfig.query().where('userId', userId).whereNull('workspaceId')
  }

  async getConfig(userId: string): Promise<GlobalUserConfig> {
    const storedConfig = await this.getStoredConfig(userId)

    try {
      const defaultConfig = await new LlmDefaultConfigService().getConfig()
      return {
        ...DEFAULTS,
        ...storedConfig,
        ...resolveEffectiveLlmConfig(storedConfig, defaultConfig),
      }
    } catch {
      return { ...DEFAULTS, ...storedConfig }
    }
  }

  async getStoredConfig(userId: string): Promise<GlobalUserConfig> {
    try {
      const row = await this.globalQuery(userId).first()
      return { ...DEFAULTS, ...(row?.config ?? {}) }
    } catch {
      return { ...DEFAULTS }
    }
  }

  async updateConfig(userId: string, updates: Partial<GlobalUserConfig>): Promise<GlobalUserConfig> {
    let row = await this.globalQuery(userId).first()

    if (!row) {
      row = await UserConfig.create({ userId, workspaceId: null, config: updates })
    } else {
      row.config = { ...row.config, ...updates }
      await row.save()
    }

    return this.getConfig(userId)
  }

  /**
   * Dismiss contextual tips. Uses set union so repeated calls are idempotent.
   */
  async dismissTips(userId: string, tipIds: string[]): Promise<void> {
    const config = await this.getConfig(userId)
    const existing = config.dismissedTipIds ?? []
    const merged = [...new Set([...existing, ...tipIds])]
    if (merged.length === existing.length) return
    await this.updateConfig(userId, { dismissedTipIds: merged })
  }
}
