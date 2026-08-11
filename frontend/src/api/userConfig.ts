import { tuyau } from './client'

export interface UserConfig {
  dismissedTipIds?: string[]
}

export interface UserConfigUpdate {
  dismissedTipIds?: string[]
}

export const getUserConfig = async (): Promise<{ config: UserConfig }> => {
  const response = await tuyau['user-config'].$get()
  if (response.error) {
    throw response.error
  }
  return response.data as { config: UserConfig }
}

export const updateUserConfig = async (updates: UserConfigUpdate): Promise<{ config: UserConfig }> => {
  const response = await tuyau['user-config'].$patch(updates)
  if (response.error) {
    throw response.error
  }
  return response.data as { config: UserConfig }
}
