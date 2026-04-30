export type MarvinConfig = Record<string, never>

const EMPTY_MARVIN_CONFIG: MarvinConfig = {}

export default class MarvinConfigService {
  async getConfig(_userId: string, _workspaceId: string): Promise<MarvinConfig> {
    return { ...EMPTY_MARVIN_CONFIG }
  }

  async updateConfig(_userId: string, _workspaceId: string): Promise<MarvinConfig> {
    return { ...EMPTY_MARVIN_CONFIG }
  }

  getDefaults(): MarvinConfig {
    return { ...EMPTY_MARVIN_CONFIG }
  }
}
