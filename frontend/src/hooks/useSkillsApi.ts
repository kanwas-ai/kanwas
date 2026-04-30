import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/auth'
import { showToast } from '@/utils/toast'
import * as api from '@/api/skills'
import type { Skill, CreateSkillInput, UpdateSkillInput, SkillUsageStat } from '@/api/skills'

export type { SkillUsageStat }

export const useSkills = () => {
  const { state } = useAuth()

  return useQuery({
    queryKey: ['skills'],
    enabled: state.isAuthenticated && !state.isLoading,
    queryFn: api.listSkills,
    staleTime: 30 * 1000, // 30 seconds
  })
}

export const useSkill = (id?: string) => {
  const { state } = useAuth()

  return useQuery({
    queryKey: ['skill', id],
    enabled: !!id && state.isAuthenticated && !state.isLoading,
    queryFn: () => api.getSkill(id!),
  })
}

export const useCreateSkill = () => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.createSkill(input),
    onSuccess: (newSkill) => {
      // Optimistically add the new skill to the cache immediately
      // This ensures shadowing takes effect right away
      const previousSkills = qc.getQueryData<Skill[]>(['skills'])
      if (previousSkills) {
        qc.setQueryData<Skill[]>(['skills'], [...previousSkills, newSkill])
      }
      // Also invalidate to ensure we get any server-side changes
      qc.invalidateQueries({ queryKey: ['skills'] })
      showToast('Skill created successfully', 'success')
    },
    onError: () => {
      showToast('Failed to create skill', 'error')
    },
  })
}

export const useUpdateSkill = () => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSkillInput }) => api.updateSkill(id, input),
    onSuccess: (updatedSkill, { id }) => {
      // Optimistically update the skill in the cache immediately
      // This ensures shadowing state updates right away when skill names change
      const previousSkills = qc.getQueryData<Skill[]>(['skills'])
      if (previousSkills) {
        qc.setQueryData<Skill[]>(
          ['skills'],
          previousSkills.map((s) => (s.id === id ? updatedSkill : s))
        )
      }
      // Also invalidate to ensure we get any server-side changes
      qc.invalidateQueries({ queryKey: ['skills'] })
      qc.invalidateQueries({ queryKey: ['skill', id] })
      showToast('Skill updated successfully', 'success')
    },
    onError: () => {
      showToast('Failed to update skill', 'error')
    },
  })
}

export const useDeleteSkill = () => {
  const qc = useQueryClient()

  return useMutation<void, unknown, string, { previousSkills?: Skill[] }>({
    mutationFn: api.deleteSkill,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['skills'] })
      const previousSkills = qc.getQueryData<Skill[]>(['skills'])

      if (previousSkills) {
        qc.setQueryData<Skill[]>(
          ['skills'],
          previousSkills.filter((s) => s.id !== id)
        )
      }

      return { previousSkills }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previousSkills) {
        qc.setQueryData(['skills'], ctx.previousSkills)
      }
      showToast('Failed to delete skill', 'error')
    },
    onSuccess: () => {
      showToast('Skill deleted successfully', 'success')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

export const useToggleSkill = () => {
  const qc = useQueryClient()

  return useMutation<Skill, unknown, { id: string; enabled: boolean }, { previousSkills?: Skill[] }>({
    mutationFn: ({ id, enabled }) => (enabled ? api.enableSkill(id) : api.disableSkill(id)),
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: ['skills'] })
      const previousSkills = qc.getQueryData<Skill[]>(['skills'])

      if (previousSkills) {
        qc.setQueryData<Skill[]>(
          ['skills'],
          previousSkills.map((s) => (s.id === id ? { ...s, enabled } : s))
        )
      }

      return { previousSkills }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousSkills) {
        qc.setQueryData(['skills'], ctx.previousSkills)
      }
      showToast('Failed to update skill', 'error')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

export const useDuplicateSkill = () => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.duplicateSkill(id),
    onSuccess: (newSkill) => {
      qc.invalidateQueries({ queryKey: ['skills'] })
      showToast(`Created "${newSkill.name}"`, 'success')
    },
    onError: () => {
      showToast('Failed to duplicate skill', 'error')
    },
  })
}

export const useSkillStats = () => {
  const { state } = useAuth()

  return useQuery({
    queryKey: ['skills', 'stats'],
    enabled: state.isAuthenticated && !state.isLoading,
    queryFn: api.getSkillStats,
    staleTime: 60 * 1000, // 1 minute
  })
}
