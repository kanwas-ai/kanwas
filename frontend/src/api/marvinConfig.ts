import { tuyau } from './client'

export type MarvinConfig = Record<string, never>

export interface MarvinConfigResponse {
  config: MarvinConfig
  defaults: MarvinConfig
  workspaceId: string
}

export const getMarvinConfig = async (workspaceId: string): Promise<MarvinConfigResponse> => {
  const response = await tuyau.workspaces({ id: workspaceId })['marvin-config'].$get()
  if (response.error) {
    throw response.error
  }
  return response.data as MarvinConfigResponse
}

export const updateMarvinConfig = async (
  workspaceId: string,
  config: MarvinConfig = {}
): Promise<{ config: MarvinConfig }> => {
  const response = await tuyau.workspaces({ id: workspaceId })['marvin-config'].$patch(config)
  if (response.error) {
    throw response.error
  }
  return response.data as { config: MarvinConfig }
}
