import { tuyau } from '@/api/client'

type ApiErrorPayload = {
  error?: string
  message?: string
  code?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getErrorPayload(error: unknown): ApiErrorPayload | undefined {
  if (!isRecord(error)) {
    return undefined
  }

  const wrappedValue = error.value
  if (isRecord(wrappedValue)) {
    return wrappedValue as ApiErrorPayload
  }

  return error as ApiErrorPayload
}

function getErrorMessage(payload: ApiErrorPayload | undefined, fallbackMessage: string): string {
  return payload?.error || payload?.message || fallbackMessage
}

function toError(payload: ApiErrorPayload | undefined, fallbackMessage: string): Error {
  return new Error(getErrorMessage(payload, fallbackMessage))
}

function ensureNoApiError(response: { error?: unknown }, fallbackMessage: string): void {
  if (response.error) {
    throw toError(getErrorPayload(response.error), fallbackMessage)
  }
}

function getStringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export interface ToolkitStatus {
  toolkit: string
  displayName: string
  logo?: string
  description?: string
  categories?: ToolkitCategory[]
  isConnected: boolean
  connectedAccountId?: string
  connectedAccountStatus?: string
  authConfigId?: string
  authMode?: string
  isComposioManaged?: boolean
  isNoAuth: boolean
}

export interface ToolkitCategory {
  slug: string
  name: string
}

export type ConnectionStatus = ToolkitStatus

export interface InitiateConnectionPayload {
  toolkit: string
  callbackUrl: string
  customAuth?: {
    mode?: string
    credentials?: Record<string, unknown>
  }
}

export type CustomAuthFieldControl = 'text' | 'textarea' | 'password' | 'select'

export interface CustomAuthFieldUiOption {
  value: string
  label: string
  description?: string
}

export interface CustomAuthFieldUiHints {
  control: CustomAuthFieldControl
  options?: CustomAuthFieldUiOption[]
  allowCustomValue?: boolean
  preferredDefaultValue?: string
  customValuePlaceholder?: string
  helpText?: string
}

export interface CustomAuthField {
  name: string
  displayName: string
  type: string
  required: boolean
  default: string | null
  description: string
  uiHints?: CustomAuthFieldUiHints
}

export interface CustomAuthModeRequirements {
  mode: string
  name: string
  authConfigCreation: {
    required: CustomAuthField[]
    optional: CustomAuthField[]
  }
  connectedAccountInitiation: {
    required: CustomAuthField[]
    optional: CustomAuthField[]
  }
}

export interface ToolkitCustomAuthRequirements {
  toolkit: string
  displayName: string
  composioManagedAuthSchemes: string[]
  authModes: CustomAuthModeRequirements[]
}

export interface GetToolkitsParams {
  search?: string
  isConnected?: boolean
}

export interface InitiateConnectionSuccess {
  status: 'OK'
  redirectUrl: string
  connectedAccountId: string
}

export interface InitiateConnectionRequiresCustomAuth {
  status: 'CUSTOM_AUTH_REQUIRED'
  requirements: ToolkitCustomAuthRequirements
}

export type InitiateConnectionResult = InitiateConnectionSuccess | InitiateConnectionRequiresCustomAuth

export type InitiateConnectionErrorCode =
  | 'TOOLKIT_REQUIRED'
  | 'CUSTOM_AUTH_REQUIRED'
  | 'CUSTOM_AUTH_INVALID'
  | 'INVALID_CALLBACK_URL'
  | 'INITIATE_FAILED'

export class InitiateConnectionError extends Error {
  code?: InitiateConnectionErrorCode | string

  constructor(message: string, code?: InitiateConnectionErrorCode | string) {
    super(message)
    this.name = 'InitiateConnectionError'
    this.code = code
  }
}

function isToolkitCustomAuthRequirements(value: unknown): value is ToolkitCustomAuthRequirements {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.toolkit === 'string' &&
    typeof value.displayName === 'string' &&
    Array.isArray(value.authModes) &&
    Array.isArray(value.composioManagedAuthSchemes) &&
    value.composioManagedAuthSchemes.every((scheme) => typeof scheme === 'string')
  )
}

function decodeInitiateConnectionResult(payload: unknown): InitiateConnectionResult {
  if (!isRecord(payload)) {
    throw new InitiateConnectionError('Connection response was incomplete', 'INITIATE_FAILED')
  }

  const status = getStringField(payload, 'status')

  if (status === 'CUSTOM_AUTH_REQUIRED') {
    const requirements = payload.requirements
    if (!isToolkitCustomAuthRequirements(requirements)) {
      throw new InitiateConnectionError('Custom auth requirements were missing from response', 'INITIATE_FAILED')
    }

    return {
      status: 'CUSTOM_AUTH_REQUIRED',
      requirements,
    }
  }

  if (status !== 'OK') {
    throw new InitiateConnectionError('Connection response was incomplete', 'INITIATE_FAILED')
  }

  const redirectUrl = getStringField(payload, 'redirectUrl')
  const connectedAccountId = getStringField(payload, 'connectedAccountId')

  if (!redirectUrl || !connectedAccountId) {
    throw new InitiateConnectionError('Connection response was incomplete', 'INITIATE_FAILED')
  }

  return {
    status: 'OK',
    redirectUrl,
    connectedAccountId,
  }
}

export const listConnectionStatuses = async (workspaceId: string): Promise<ToolkitStatus[]> => {
  const response = await tuyau.workspaces({ id: workspaceId }).connections.$get()
  ensureNoApiError(response, 'Failed to load connections')

  return (response.data as { connections: ToolkitStatus[] })?.connections ?? []
}

export const listToolkitStatuses = async (
  workspaceId: string,
  params: GetToolkitsParams = {}
): Promise<ToolkitStatus[]> => {
  const response = await tuyau.workspaces({ id: workspaceId }).connections.toolkits.$get({
    query: {
      ...(params.search ? { search: params.search } : {}),
      ...(params.isConnected !== undefined ? { isConnected: String(params.isConnected) } : {}),
    },
  })
  ensureNoApiError(response, 'Failed to load toolkits')

  return (response.data as { toolkits: ToolkitStatus[] })?.toolkits ?? []
}

export const listConnections = listConnectionStatuses
export const getToolkits = listToolkitStatuses

export const initiateConnection = async (
  workspaceId: string,
  payload: InitiateConnectionPayload
): Promise<InitiateConnectionResult> => {
  const response = await tuyau.workspaces({ id: workspaceId }).connections.initiate.$post({
    toolkit: payload.toolkit,
    callbackUrl: payload.callbackUrl,
    customAuth: payload.customAuth,
  })

  if (response.error) {
    const payloadError = getErrorPayload(response.error)
    throw new InitiateConnectionError(
      getErrorMessage(payloadError, 'Failed to initiate connection'),
      payloadError?.code
    )
  }

  return decodeInitiateConnectionResult(response.data)
}

export const disconnectConnection = async (workspaceId: string, connectedAccountId: string): Promise<void> => {
  const response = await tuyau
    .workspaces({ id: workspaceId })
    .connections({ connectionId: connectedAccountId })
    .$delete()
  ensureNoApiError(response, 'Failed to disconnect')
}
