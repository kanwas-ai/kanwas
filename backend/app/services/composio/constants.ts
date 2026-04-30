import type { ConnectedAccountStatus, CustomAuthFieldUiOverride } from './types.js'

export const GLOBAL_TOOLKIT_CATALOG_IDENTITY = 'global_toolkit_catalog'
export const CUSTOM_AUTH_CONFIG_NAME_PREFIX = 'kanwas_custom_auth'
export const EXCLUDED_CONNECTION_DISPLAY_NAME = 'test app'
export const EXCLUDED_CONNECTION_TAGS = ['tag1', 'tag2'] as const

export const CONNECTED_ACCOUNT_STATUSES: ConnectedAccountStatus[] = [
  'INITIALIZING',
  'INITIATED',
  'ACTIVE',
  'FAILED',
  'EXPIRED',
  'INACTIVE',
]

export const CUSTOM_AUTH_FIELD_UI_OVERRIDES: CustomAuthFieldUiOverride[] = [
  {
    toolkit: 'posthog',
    mode: 'API_KEY',
    fieldGroup: 'authConfigCreation',
    fieldName: 'subdomain',
    uiHints: {
      control: 'select',
      options: [
        {
          value: 'us.i',
          label: 'US Cloud (public)',
        },
        {
          value: 'eu.i',
          label: 'EU Cloud (public)',
        },
        {
          value: 'us',
          label: 'US Cloud (private)',
        },
        {
          value: 'eu',
          label: 'EU Cloud (private)',
        },
      ],
      allowCustomValue: true,
      preferredDefaultValue: 'us.i',
      customValuePlaceholder: 'mycompany',
      helpText: 'For self-hosted PostHog, enter your custom subdomain.',
    },
  },
]
