export const WORKSPACE_ONBOARDING_STATUSES = ['not_started', 'in_progress', 'completed', 'dismissed'] as const

export type WorkspaceOnboardingStatus = (typeof WORKSPACE_ONBOARDING_STATUSES)[number]

export const WORKSPACE_ONBOARDING_PROMPT = 'Please onboard me into this workspace. Use onboarding skill'

export const WORKSPACE_ONBOARDING_TASK_DESCRIPTION = "Let's make this workspace yours"
