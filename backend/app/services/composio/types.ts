export interface ConnectionCategory {
  slug: string
  name: string
}

export interface InitiateConnectionResult {
  redirectUrl: string
  connectedAccountId: string
}

export interface InitiateConnectionParams {
  toolkit: string
  customAuth?: {
    mode?: string
    credentials?: Record<string, unknown>
  }
  callbackUrl: string
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

export type CustomAuthFieldGroup = 'authConfigCreation' | 'connectedAccountInitiation'

export interface CustomAuthFieldNormalizationContext {
  toolkit: string
  mode: string
  fieldGroup: CustomAuthFieldGroup
}

export interface CustomAuthFieldUiOverride {
  toolkit: string
  mode: string
  fieldGroup: CustomAuthFieldGroup
  fieldName: string
  uiHints: CustomAuthFieldUiHints
}

export interface ConnectionStatus {
  toolkit: string
  displayName: string
  logo?: string
  description?: string
  categories?: ConnectionCategory[]
  isConnected: boolean
  connectedAccountId?: string
  connectedAccountStatus?: string
  authConfigId?: string
  authMode?: string
  isComposioManaged?: boolean
  isNoAuth: boolean
}

export interface ToolkitConnectionDetails {
  isActive: boolean
  authConfig?: {
    id: string
    mode: string
    isComposioManaged: boolean
  } | null
  connectedAccount?: {
    id: string
    status: string
  }
}

export interface ToolkitConnectionState {
  slug: string
  name: string
  logo?: string
  description?: string
  categories?: ConnectionCategory[]
  isNoAuth: boolean
  connection?: ToolkitConnectionDetails
}

export interface ToolkitCatalogMetadata {
  displayName?: string
  logo?: string
  description?: string
  categories?: ConnectionCategory[]
  isNoAuth?: boolean
}

export interface ToolkitsPage {
  items: ToolkitConnectionState[]
  nextCursor?: string
}

export interface ListToolkitsFilters {
  search?: string
  isConnected?: boolean
  toolkits?: string[]
}

export interface ToolRouterSession {
  toolkits: (options?: {
    limit?: number
    nextCursor?: string
    search?: string
    isConnected?: boolean
    toolkits?: string[]
  }) => Promise<ToolkitsPage>
  authorize: (toolkit: string, options?: { callbackUrl?: string }) => Promise<ConnectionRequest>
}

export interface ConnectionRequest {
  id: string
  redirectUrl?: string | null
}

export interface ConnectedAccountState {
  id: string
  status?: string
  appName?: string
  toolkit?: {
    slug?: string
  }
  authConfig?: {
    id?: string
    name?: string
    isComposioManaged?: boolean
  }
  state?: {
    auth_scheme?: string
    authScheme?: string
  }
}

export interface ActiveConnectedAccount {
  connectedAccountId: string
  connectedAccountStatus: 'ACTIVE'
  authConfigId?: string
  authMode?: string
  isComposioManaged?: boolean
}

export type ConnectedAccountStatus = 'INITIALIZING' | 'INITIATED' | 'ACTIVE' | 'FAILED' | 'EXPIRED' | 'INACTIVE'

export interface ConnectedAccountsListOptions {
  userIds: string[]
  cursor?: string
  limit?: number
  statuses?: ConnectedAccountStatus[]
}

export interface ConnectedAccountsPage {
  items: ConnectedAccountState[]
  nextCursor?: string | null
}

export interface CreateAuthConfigResponse {
  id: string
}

export interface AuthConfigState {
  id?: string
  name?: string
  isComposioManaged?: boolean
}

export type CustomAuthCredentialValue = string | number | boolean
export type CustomAuthCredentials = Record<string, CustomAuthCredentialValue>
