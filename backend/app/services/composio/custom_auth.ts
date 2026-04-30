import { randomUUID } from 'node:crypto'
import type { Composio } from '@composio/core'
import type { ContextualLoggerContract } from '#contracts/contextual_logger'
import { normalizeAuthConfigState } from './auth_config.js'
import { CUSTOM_AUTH_CONFIG_NAME_PREFIX, CUSTOM_AUTH_FIELD_UI_OVERRIDES } from './constants.js'
import { extractComposioErrorDetails } from './error_classifier.js'
import { InvalidCustomAuthConfigError, ToolkitRequiredError } from './errors.js'
import { isRecord, normalizeToolkit } from './normalization.js'
import type {
  AuthConfigState,
  CreateAuthConfigResponse,
  CustomAuthCredentials,
  CustomAuthCredentialValue,
  CustomAuthField,
  CustomAuthFieldNormalizationContext,
  CustomAuthFieldUiHints,
  CustomAuthModeRequirements,
  InitiateConnectionParams,
  ToolkitCustomAuthRequirements,
} from './types.js'

type WarnLogger = Pick<ContextualLoggerContract, 'warn'>

function cloneCustomAuthFieldUiHints(uiHints: CustomAuthFieldUiHints): CustomAuthFieldUiHints {
  return {
    ...uiHints,
    ...(Array.isArray(uiHints.options)
      ? {
          options: uiHints.options.map((option) => ({
            ...option,
          })),
        }
      : {}),
  }
}

function resolveCustomAuthFieldUiHints(
  context: CustomAuthFieldNormalizationContext,
  fieldName: string
): CustomAuthFieldUiHints | undefined {
  const normalizedToolkit = normalizeToolkit(context.toolkit)
  if (!normalizedToolkit) {
    return undefined
  }

  const normalizedMode = context.mode.trim().toUpperCase()
  const normalizedFieldName = fieldName.trim().toLowerCase()

  for (const override of CUSTOM_AUTH_FIELD_UI_OVERRIDES) {
    if (
      override.toolkit !== normalizedToolkit ||
      override.mode !== normalizedMode ||
      override.fieldGroup !== context.fieldGroup ||
      override.fieldName !== normalizedFieldName
    ) {
      continue
    }

    return cloneCustomAuthFieldUiHints(override.uiHints)
  }

  return undefined
}

function normalizeCustomAuthField(
  rawField: unknown,
  context?: CustomAuthFieldNormalizationContext
): CustomAuthField | undefined {
  if (!isRecord(rawField)) {
    return undefined
  }

  const name = typeof rawField.name === 'string' ? rawField.name.trim() : ''
  if (!name) {
    return undefined
  }

  const displayName = typeof rawField.displayName === 'string' ? rawField.displayName.trim() : ''
  const type = typeof rawField.type === 'string' ? rawField.type.trim() : ''
  const description = typeof rawField.description === 'string' ? rawField.description.trim() : ''

  const normalizedField: CustomAuthField = {
    name,
    displayName: displayName || name,
    type: type || 'string',
    required: rawField.required === true,
    default: typeof rawField.default === 'string' ? rawField.default : null,
    description,
  }

  if (context) {
    const uiHints = resolveCustomAuthFieldUiHints(context, name)
    if (uiHints) {
      normalizedField.uiHints = uiHints
    }
  }

  return normalizedField
}

function normalizeCustomAuthFieldGroup(
  rawFields: unknown,
  context: CustomAuthFieldNormalizationContext
): {
  required: CustomAuthField[]
  optional: CustomAuthField[]
} {
  if (!isRecord(rawFields)) {
    return { required: [], optional: [] }
  }

  const required = Array.isArray(rawFields.required)
    ? rawFields.required
        .map((field) => normalizeCustomAuthField(field, context))
        .filter((field): field is CustomAuthField => field !== undefined)
    : []

  const optional = Array.isArray(rawFields.optional)
    ? rawFields.optional
        .map((field) => normalizeCustomAuthField(field, context))
        .filter((field): field is CustomAuthField => field !== undefined)
    : []

  return { required, optional }
}

function normalizeCustomAuthMode(rawMode: unknown, toolkit: string): CustomAuthModeRequirements | undefined {
  if (!isRecord(rawMode)) {
    return undefined
  }

  const mode = typeof rawMode.mode === 'string' ? rawMode.mode.trim().toUpperCase() : ''
  const name = typeof rawMode.name === 'string' ? rawMode.name.trim() : ''
  const fields = isRecord(rawMode.fields) ? rawMode.fields : {}

  if (!mode || !name) {
    return undefined
  }

  return {
    mode,
    name,
    authConfigCreation: normalizeCustomAuthFieldGroup(fields.authConfigCreation, {
      toolkit,
      mode,
      fieldGroup: 'authConfigCreation',
    }),
    connectedAccountInitiation: normalizeCustomAuthFieldGroup(fields.connectedAccountInitiation, {
      toolkit,
      mode,
      fieldGroup: 'connectedAccountInitiation',
    }),
  }
}

interface ToolkitsApi {
  get?: (value: unknown) => Promise<unknown>
}

function getToolkitsApi(composio: Composio): ToolkitsApi {
  return (
    (
      composio as unknown as {
        toolkits?: ToolkitsApi
      }
    ).toolkits ?? {}
  )
}

export async function getCustomAuthRequirements(
  composio: Composio,
  toolkit: string
): Promise<ToolkitCustomAuthRequirements> {
  const normalizedToolkit = normalizeToolkit(toolkit)
  if (!normalizedToolkit) {
    throw new ToolkitRequiredError('Toolkit is required to retrieve custom auth requirements')
  }

  const toolkitApi = getToolkitsApi(composio)
  if (!toolkitApi?.get) {
    return {
      toolkit: normalizedToolkit,
      displayName: normalizedToolkit,
      composioManagedAuthSchemes: [],
      authModes: [],
    }
  }

  const rawToolkit = await toolkitApi.get(normalizedToolkit)
  const toolkitRecord = isRecord(rawToolkit) ? rawToolkit : {}

  const displayName =
    typeof toolkitRecord.name === 'string' && toolkitRecord.name.trim().length > 0
      ? toolkitRecord.name.trim()
      : normalizedToolkit

  const composioManagedAuthSchemes = Array.isArray(toolkitRecord.composioManagedAuthSchemes)
    ? toolkitRecord.composioManagedAuthSchemes
        .map((scheme) => (typeof scheme === 'string' ? scheme.trim().toUpperCase() : ''))
        .filter((scheme): scheme is string => scheme.length > 0)
    : []

  const authModesByKey = new Map<string, CustomAuthModeRequirements>()
  const rawAuthModes = Array.isArray(toolkitRecord.authConfigDetails) ? toolkitRecord.authConfigDetails : []

  for (const rawMode of rawAuthModes) {
    const mode = normalizeCustomAuthMode(rawMode, normalizedToolkit)
    if (!mode) {
      continue
    }

    authModesByKey.set(`${mode.mode}:${mode.name}`, mode)
  }

  return {
    toolkit: normalizedToolkit,
    displayName,
    composioManagedAuthSchemes,
    authModes: Array.from(authModesByKey.values()),
  }
}

function normalizeCustomAuthCredentialValue(value: unknown): CustomAuthCredentialValue | undefined {
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value : undefined
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value === 'boolean') {
    return value
  }

  return undefined
}

function normalizeCustomAuthCredentials(credentials?: Record<string, unknown>): CustomAuthCredentials {
  if (!credentials) {
    return {}
  }

  const normalizedCredentials: CustomAuthCredentials = {}

  for (const [rawName, rawValue] of Object.entries(credentials)) {
    const name = rawName.trim()
    if (!name) {
      continue
    }

    const value = normalizeCustomAuthCredentialValue(rawValue)
    if (value !== undefined) {
      normalizedCredentials[name] = value
    }
  }

  return normalizedCredentials
}

function sanitizeCustomAuthNameSegment(value: string, maxLength: number): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')

  if (!normalized) {
    return 'x'
  }

  return normalized.slice(0, maxLength)
}

function buildCustomAuthConfigName(toolkit: string, mode: string): string {
  const toolkitSegment = sanitizeCustomAuthNameSegment(toolkit, 32)
  const modeSegment = sanitizeCustomAuthNameSegment(mode, 24)
  const runId = randomUUID().replace(/-/g, '').slice(0, 16)

  return [CUSTOM_AUTH_CONFIG_NAME_PREFIX, toolkitSegment, modeSegment, runId].join('_')
}

function withCustomAuthDefaults(
  authMode: CustomAuthModeRequirements,
  credentials: CustomAuthCredentials
): CustomAuthCredentials {
  const configuredCredentials: CustomAuthCredentials = {}
  const allFields = [...authMode.authConfigCreation.required, ...authMode.authConfigCreation.optional]

  for (const field of allFields) {
    const providedValue = credentials[field.name]
    if (providedValue !== undefined) {
      configuredCredentials[field.name] = providedValue
      continue
    }

    if (field.default !== null) {
      const defaultValue = normalizeCustomAuthCredentialValue(field.default)
      if (defaultValue !== undefined) {
        configuredCredentials[field.name] = defaultValue
      }
    }
  }

  const missingRequiredFields = authMode.authConfigCreation.required.filter((field) => {
    const value = configuredCredentials[field.name]

    if (value === undefined) {
      return true
    }

    if (typeof value === 'string') {
      return value.trim().length === 0
    }

    return false
  })

  if (missingRequiredFields.length > 0) {
    const missingLabels = missingRequiredFields.map((field) => field.displayName || field.name)
    throw new InvalidCustomAuthConfigError(`Missing required custom auth fields: ${missingLabels.join(', ')}`)
  }

  return configuredCredentials
}

interface AuthConfigsApi {
  create?: (
    toolkit: string,
    options: {
      type: 'use_custom_auth'
      name: string
      authScheme: string
      credentials: CustomAuthCredentials
    }
  ) => Promise<CreateAuthConfigResponse>
  get?: (authConfigId: string) => Promise<unknown>
  delete?: (authConfigId: string) => Promise<void>
}

function getAuthConfigsApi(composio: Composio): AuthConfigsApi {
  return (
    (
      composio as unknown as {
        authConfigs?: AuthConfigsApi
      }
    ).authConfigs ?? {}
  )
}

function isKanwasCustomAuthConfigName(name: string): boolean {
  return name.startsWith(`${CUSTOM_AUTH_CONFIG_NAME_PREFIX}_`)
}

async function getAuthConfigById(composio: Composio, authConfigId: string): Promise<AuthConfigState | undefined> {
  const authConfigsApi = getAuthConfigsApi(composio)
  if (!authConfigsApi.get) {
    return undefined
  }

  try {
    const authConfig = await authConfigsApi.get(authConfigId)
    return normalizeAuthConfigState(authConfig)
  } catch {
    return undefined
  }
}

export async function deleteCustomAuthConfig(
  composio: Composio,
  logger: WarnLogger,
  authConfigId: string
): Promise<void> {
  const authConfigsApi = getAuthConfigsApi(composio)
  if (!authConfigsApi.delete) {
    return
  }

  try {
    await authConfigsApi.delete(authConfigId)
  } catch (error) {
    logger.warn(
      {
        operation: 'composio_custom_auth_config_delete_failed',
        authConfigId,
        error,
      },
      'Failed to delete Composio custom auth config'
    )
  }
}

export async function cleanupCustomAuthConfigIfKanwasManaged(
  composio: Composio,
  logger: WarnLogger,
  authConfig: AuthConfigState | undefined
): Promise<void> {
  const authConfigId = typeof authConfig?.id === 'string' ? authConfig.id.trim() : ''
  if (!authConfigId) {
    return
  }

  if (authConfig?.isComposioManaged) {
    return
  }

  let authConfigName =
    typeof authConfig?.name === 'string' && authConfig.name.trim().length > 0 ? authConfig.name.trim() : undefined

  if (!authConfigName) {
    const fetchedAuthConfig = await getAuthConfigById(composio, authConfigId)
    authConfigName = fetchedAuthConfig?.name
  }

  if (!authConfigName || !isKanwasCustomAuthConfigName(authConfigName)) {
    return
  }

  await deleteCustomAuthConfig(composio, logger, authConfigId)
}

async function createCustomAuthConfig(
  composio: Composio,
  toolkit: string,
  mode: string,
  name: string,
  credentials: CustomAuthCredentials
): Promise<string> {
  const authConfigsApi = getAuthConfigsApi(composio)

  if (!authConfigsApi?.create) {
    throw new InvalidCustomAuthConfigError('Composio auth config creation is not available in this environment')
  }

  try {
    const createdConfig = await authConfigsApi.create(toolkit, {
      type: 'use_custom_auth',
      name,
      authScheme: mode,
      credentials,
    })

    if (!createdConfig?.id) {
      throw new InvalidCustomAuthConfigError('Composio did not return an auth config ID')
    }

    return createdConfig.id
  } catch (error) {
    const details = extractComposioErrorDetails(error)
    throw new InvalidCustomAuthConfigError(
      details.message || `Failed to create custom auth config for toolkit "${toolkit}"`
    )
  }
}

export async function resolveOrCreateCustomAuthConfig(
  composio: Composio,
  toolkit: string,
  customAuth: NonNullable<InitiateConnectionParams['customAuth']>
): Promise<string> {
  const requirements = await getCustomAuthRequirements(composio, toolkit)

  if (requirements.authModes.length === 0) {
    throw new InvalidCustomAuthConfigError(`Toolkit "${toolkit}" does not expose custom auth configuration fields`)
  }

  const requestedMode = typeof customAuth.mode === 'string' ? customAuth.mode.trim().toUpperCase() : ''
  const resolvedMode =
    requestedMode.length > 0
      ? requirements.authModes.find((mode) => mode.mode === requestedMode)
      : requirements.authModes.length === 1
        ? requirements.authModes[0]
        : undefined

  if (!resolvedMode) {
    if (!requestedMode && requirements.authModes.length > 1) {
      throw new InvalidCustomAuthConfigError(
        `Toolkit "${toolkit}" supports multiple auth modes. Select one of: ${requirements.authModes
          .map((mode) => mode.mode)
          .join(', ')}`
      )
    }

    throw new InvalidCustomAuthConfigError(`Unsupported auth mode "${requestedMode}" for toolkit "${toolkit}"`)
  }

  const normalizedCredentials = normalizeCustomAuthCredentials(customAuth.credentials)
  const credentials = withCustomAuthDefaults(resolvedMode, normalizedCredentials)
  const authConfigName = buildCustomAuthConfigName(toolkit, resolvedMode.mode)

  return createCustomAuthConfig(composio, toolkit, resolvedMode.mode, authConfigName, credentials)
}
