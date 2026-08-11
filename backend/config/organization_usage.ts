const ORGANIZATION_USAGE_CONFIG = {
  staleCutoffMinutes: 10,
  posthog: {
    host: 'https://eu.posthog.com',
    projectId: '127965',
    organizationGroupTypeIndex: 1,
    queryTimeoutMs: 8000,
  },
} as const

export default ORGANIZATION_USAGE_CONFIG
