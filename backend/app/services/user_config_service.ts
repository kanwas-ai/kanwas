import UserConfig from '#models/user_config'

export interface GlobalUserConfig {
  dismissedTipIds?: string[]
}

const DEFAULTS: GlobalUserConfig = {}

export default class UserConfigService {
  private globalQuery(userId: string) {
    return UserConfig.query().where('userId', userId).whereNull('workspaceId')
  }

  async getConfig(userId: string): Promise<GlobalUserConfig> {
    return this.getStoredConfig(userId)
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
