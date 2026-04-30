import { tuyau } from '@/api/client'

export interface Skill {
  id: string
  userId: string | null
  name: string
  description: string
  body: string
  metadata: Record<string, unknown>
  isSystem: boolean
  enabled: boolean
  createdAt: string // ISO date string from API
  updatedAt: string | null // ISO date string from API
}

export interface CreateSkillInput {
  name: string
  description: string
  body: string
  metadata?: Record<string, unknown>
}

export interface UpdateSkillInput {
  name?: string
  description?: string
  body?: string
  metadata?: Record<string, unknown>
}

export interface SkillUsageStat {
  skillName: string
  skillId: string | null
  totalCount: number
  commandCount: number
  agentCount: number
  lastUsedAt: string | null
}

export const listSkills = async (): Promise<Skill[]> => {
  const response = await tuyau.skills.$get()
  return (response.data ?? []) as Skill[]
}

export const getSkill = async (id: string): Promise<Skill> => {
  const response = await tuyau.skills({ id }).$get()
  return response.data as Skill
}

export const createSkill = async (input: CreateSkillInput): Promise<Skill> => {
  const response = await tuyau.skills.$post(input)
  return response.data as Skill
}

export const updateSkill = async (id: string, input: UpdateSkillInput): Promise<Skill> => {
  const response = await tuyau.skills({ id }).$put(input)
  return response.data as Skill
}

export const deleteSkill = async (id: string): Promise<void> => {
  await tuyau.skills({ id }).$delete()
}

export const enableSkill = async (id: string): Promise<Skill> => {
  const response = await tuyau.skills({ id }).enable.$put({})
  return response.data as Skill
}

export const disableSkill = async (id: string): Promise<Skill> => {
  const response = await tuyau.skills({ id }).disable.$put({})
  return response.data as Skill
}

export const duplicateSkill = async (id: string): Promise<Skill> => {
  const response = await tuyau.skills({ id }).duplicate.$post({})
  return response.data as Skill
}

export const getSkillStats = async (): Promise<SkillUsageStat[]> => {
  const response = await tuyau.skills.stats.$get()
  return (response.data ?? []) as SkillUsageStat[]
}
