import { tuyau } from './client'

export interface BashExecuteResponse {
  stdout: string
  stderr: string
  exitCode: number
  cwd: string
}

export interface SandboxStatusResponse {
  available: boolean
  agentRunning: boolean
  cwd: string
}

export interface ShutdownResponse {
  shutdown: boolean
}

export const executeDebugBash = async (workspaceId: string, command: string): Promise<BashExecuteResponse> => {
  const response = await tuyau.workspaces({ id: workspaceId }).debug.bash.$post({ command })
  if (response.error) {
    throw response.error
  }
  return response.data as BashExecuteResponse
}

export const getSandboxStatus = async (workspaceId: string): Promise<SandboxStatusResponse> => {
  const response = await tuyau.workspaces({ id: workspaceId }).debug['sandbox-status'].$get()
  if (response.error) {
    throw response.error
  }
  return response.data as SandboxStatusResponse
}

export const shutdownSandbox = async (workspaceId: string): Promise<ShutdownResponse> => {
  const response = await tuyau.workspaces({ id: workspaceId }).debug.shutdown.$post({})
  if (response.error) {
    throw response.error
  }
  return response.data as ShutdownResponse
}
