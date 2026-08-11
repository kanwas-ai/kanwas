/**
 * In prod, the SPA is served under /<ADMIN_PATH>/, but the build doesn't know
 * that path (one artifact is reused across staging and prod). The vite base is
 * a /__ADMIN_BASE__/ placeholder; at runtime we recover the real prefix from
 * window.location.pathname.
 */
export function getRuntimeBase(): string {
  const baked = import.meta.env.BASE_URL || '/'
  if (!baked.includes('__ADMIN_BASE__')) return baked
  const segments = window.location.pathname.split('/').filter(Boolean)
  return segments.length > 0 ? `/${segments[0]}/` : '/'
}

/**
 * In dev, talk directly to the backend. In production, use relative paths
 * (the SPA is served from the backend behind auth).
 */
function getApiBase(): string {
  const basePath = getRuntimeBase().replace(/\/$/, '')
  if (import.meta.env.DEV) {
    return `http://localhost:3333${basePath}/api`
  }
  return `${basePath}/api`
}

function getBasePath(): string {
  const basePath = getRuntimeBase().replace(/\/$/, '')
  if (import.meta.env.DEV) {
    return `http://localhost:3333${basePath}`
  }
  return basePath
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  })
  if (res.status === 401) {
    window.location.href = `${getBasePath()}/login`
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    let message = `Request failed: ${res.status}`

    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) {
        message = body.error
      }
    } catch {
      // Ignore non-JSON error bodies.
    }

    throw new Error(message)
  }
  return res.json()
}

export interface UserSummary {
  id: string
  email: string
  name: string
  createdAt: string
  orgRole: string | null
  organization: { id: string; name: string } | null
  config: Record<string, unknown>
}

export interface UsagePeriodSnapshot {
  usedCents: number
  limitCents: number
  remainingCents: number
  percent: number
  periodStartUtc: string
  periodEndUtc: string
}

export interface UsageSnapshot {
  weekly: UsagePeriodSnapshot
  monthly: UsagePeriodSnapshot
  isOutOfUsage: boolean
}

export interface TaskSummary {
  id: string
  title: string
  status: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface UserDetail extends Omit<UserSummary, 'organization'> {
  organization: {
    id: string
    name: string
    weeklyLimitCents: number
    monthlyLimitCents: number
  } | null
  usage: UsageSnapshot | null
  tasks: TaskSummary[]
}

export interface ImpersonateResult {
  token: string
  user: { id: string; email: string; name: string }
}

export function fetchUsers(search?: string): Promise<UserSummary[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  return request(`/users${params}`)
}

export function fetchUser(id: string): Promise<UserDetail> {
  return request(`/users/${id}`)
}

export function updateUserConfig(
  id: string,
  config: Record<string, unknown>
): Promise<{ config: Record<string, unknown> }> {
  return request(`/users/${id}/config`, {
    method: 'PATCH',
    body: JSON.stringify(config),
  })
}

export function impersonateUser(id: string): Promise<ImpersonateResult> {
  return request(`/impersonate/${id}`, { method: 'POST' })
}

export interface CreateUserResult {
  token: string
  user: { id: string; email: string; name: string }
  workspaceId: string
  error?: string
}

export function createDevUser(
  email: string,
  name: string,
  config?: Record<string, unknown>
): Promise<CreateUserResult> {
  return request('/dev/create-user', {
    method: 'POST',
    body: JSON.stringify({ email, name, config }),
  })
}

export function getLogoutUrl(): string {
  return `${getBasePath()}/logout`
}

// LLM Defaults

export interface LlmDefaultConfig {
  llmProvider?: 'anthropic' | 'openai' | null
  llmModel?: string | null
  llmServiceTier?: 'default' | 'priority' | null
}

export function fetchLlmDefaults(): Promise<{ config: LlmDefaultConfig }> {
  return request('/llm-defaults')
}

export function updateLlmDefaults(config: LlmDefaultConfig): Promise<{ config: LlmDefaultConfig }> {
  return request('/llm-defaults', {
    method: 'PATCH',
    body: JSON.stringify(config),
  })
}

// Skills

export type AdminSkillCategory = 'craft' | 'framework' | 'workflow' | 'custom'

export interface AdminSkill {
  id: string
  userId: string | null
  name: string
  description: string
  body: string
  metadata: Record<string, unknown>
  isSystem: boolean
  category: AdminSkillCategory
  featured: boolean
  createdAt: string
  updatedAt: string | null
}

export interface AdminSkillInput {
  name: string
  description: string
  body: string
  category: AdminSkillCategory
  featured: boolean
  metadata?: Record<string, unknown>
}

export function fetchAdminSkills(): Promise<AdminSkill[]> {
  return request('/skills')
}

export function createAdminSkill(input: AdminSkillInput): Promise<AdminSkill> {
  return request('/skills', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateAdminSkill(id: string, input: AdminSkillInput): Promise<AdminSkill> {
  return request(`/skills/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteAdminSkill(id: string): Promise<{ ok: true }> {
  return request(`/skills/${id}`, { method: 'DELETE' })
}

// Dashboard

export interface OverviewData {
  totals: { users: number; organizations: number; workspaces: number }
  signups: { today: number; thisWeek: number; thisMonth: number }
  activeUsers: { today: number; thisWeek: number; thisMonth: number }
  dailySignups: { day: string; count: number }[]
}

export interface UsageData {
  tasks: { today: number; thisWeek: number; thisMonth: number; total: number }
  statusBreakdown: { status: string; count: number }[]
  errorRate: number
  recentErrors: {
    id: string
    title: string
    description: string
    createdAt: string
    userEmail: string
    userName: string
  }[]
  topUsers: { id: string; email: string; name: string; taskCount: number }[]
  dailyTasks: { day: string; count: number }[]
}

export interface CostData {
  totalSpend: { weeklyCents: number; monthlyCents: number }
  organizations: {
    id: string
    name: string
    weeklyLimitCents: number
    monthlyLimitCents: number
    weeklySpendCents: number
    monthlySpendCents: number
    weeklyPercent: number
    monthlyPercent: number
    lastSynced: string | null
  }[]
}

export function fetchOverview(): Promise<OverviewData> {
  return request('/dashboard/overview')
}

export interface EmbedTemplate {
  id: string
  name: string
  organizationId: string
  createdAt: string
  updatedAt: string
}

export function fetchEmbedTemplates(): Promise<EmbedTemplate[]> {
  return request('/embed-templates')
}

export function addEmbedTemplate(workspaceId: string): Promise<EmbedTemplate> {
  return request('/embed-templates', {
    method: 'POST',
    body: JSON.stringify({ workspaceId }),
  })
}

export function removeEmbedTemplate(id: string): Promise<void> {
  return request(`/embed-templates/${id}`, { method: 'DELETE' })
}

export function fetchUsage(): Promise<UsageData> {
  return request('/dashboard/usage')
}

export function fetchCost(): Promise<CostData> {
  return request('/dashboard/cost')
}

export interface AdminWorkspaceSummary {
  id: string
  name: string
  organization: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export interface PortableWorkspaceTemplateFile {
  version: 1
  name: string
  exportedAt: string
  sourceWorkspaceId: string
  snapshot: {
    root: string
    notes: Record<string, string>
  }
  assets?: PortableWorkspaceTemplateAsset[]
}

export interface PortableWorkspaceTemplateAsset {
  kind: 'image'
  nodeId: string
  filename: string
  mimeType: string
  size: number
  contentHash: string
  dataBase64: string
}

export interface DefaultWorkspaceTemplateMetadata {
  id: string
  name: string
  version: number
  sourceWorkspaceId: string | null
  exportedAt: string | null
  createdAt: string
  updatedAt: string
}

export function fetchWorkspaces(search?: string): Promise<AdminWorkspaceSummary[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  return request(`/workspaces${params}`)
}

export function exportWorkspaceTemplate(workspaceId: string): Promise<PortableWorkspaceTemplateFile> {
  return request(`/workspaces/${workspaceId}/template-export`)
}

export function fetchDefaultWorkspaceTemplate(): Promise<{ template: DefaultWorkspaceTemplateMetadata | null }> {
  return request('/workspace-templates/default')
}

export function uploadDefaultWorkspaceTemplate(
  template: PortableWorkspaceTemplateFile
): Promise<{ template: DefaultWorkspaceTemplateMetadata | null }> {
  return request('/workspace-templates/default', {
    method: 'POST',
    body: JSON.stringify(template),
  })
}

export function clearDefaultWorkspaceTemplate(): Promise<{ template: null }> {
  return request('/workspace-templates/default', {
    method: 'DELETE',
  })
}
