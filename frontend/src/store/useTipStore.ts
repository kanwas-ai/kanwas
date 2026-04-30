import { useMemo } from 'react'
import { proxy, subscribe, useSnapshot } from 'valtio'
import { getUserConfig, updateUserConfig } from '@/api/userConfig'

const STORAGE_KEY = 'kanwas:tips'

type TipState = {
  dismissedTipIds: string[]
}

function readLocalStorage(): string[] {
  try {
    const storage = globalThis.localStorage
    const stored = typeof storage?.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed?.dismissedTipIds)) {
        return parsed.dismissedTipIds
      }
    }
  } catch {
    // ignore
  }
  return []
}

// Initialize from localStorage for instant availability (no loading flash)
const tipState = proxy<TipState>({ dismissedTipIds: readLocalStorage() })

// Mirror to localStorage as offline cache
subscribe(tipState, () => {
  try {
    const storage = globalThis.localStorage
    if (typeof storage?.setItem === 'function') {
      storage.setItem(STORAGE_KEY, JSON.stringify({ dismissedTipIds: [...tipState.dismissedTipIds] }))
    }
  } catch {
    // ignore
  }
})

/**
 * Initialize tip store from backend. Merges localStorage values with backend,
 * pushes any localStorage-only IDs to the server (one-time migration).
 * Safe to call multiple times — only runs once.
 */
let initialized = false
export async function initTipStore(): Promise<void> {
  if (initialized) return
  initialized = true

  try {
    const { config } = await getUserConfig()
    const serverIds = config.dismissedTipIds ?? []
    const localIds = tipState.dismissedTipIds

    // Union: merge both sources
    const merged = [...new Set([...serverIds, ...localIds])]
    tipState.dismissedTipIds = merged

    // Push any localStorage-only IDs to server (one-time migration)
    const localOnly = localIds.filter((id) => !serverIds.includes(id))
    if (localOnly.length > 0) {
      updateUserConfig({ dismissedTipIds: localOnly }).catch(() => {
        // Best-effort migration — silent failure is fine
      })
    }
  } catch {
    // Backend unavailable — localStorage values are already loaded, continue
  }
}

export const dismissTip = (id: string) => {
  if (tipState.dismissedTipIds.includes(id)) return

  // Optimistic update — tip disappears immediately
  tipState.dismissedTipIds.push(id)

  // Fire-and-forget to backend
  updateUserConfig({ dismissedTipIds: [id] }).catch(() => {
    // Silent failure — localStorage has it, next initTipStore will retry migration
  })
}

export function useTipStore() {
  const snap = useSnapshot(tipState)
  return {
    dismissedTipIds: snap.dismissedTipIds,
    dismissTip,
  }
}

// ---------------------------------------------------------------------------
// Hook: extract active (non-dismissed) tips from timeline
// ---------------------------------------------------------------------------

export interface ActiveTip {
  tipId: string
  connector?: string
  label?: string
}

export function useActiveTips(
  timeline: ReadonlyArray<{ type: string; tipId?: string; connector?: string; label?: string }>
): { connectTools: ActiveTip | null; voiceInput: boolean; directModeAvailable: boolean } {
  const { dismissedTipIds } = useTipStore()

  // Wait until the agent has produced a text response before surfacing any tip
  const hasAgentText = useMemo(() => {
    let lastUserIdx = -1
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].type === 'user_message') {
        lastUserIdx = i
        break
      }
    }
    return timeline.slice(lastUserIdx + 1).some((i) => i.type === 'chat')
  }, [timeline])

  const connectTools = useMemo(() => {
    if (!hasAgentText) return null
    if (dismissedTipIds.includes('connect_tools')) return null
    const item = timeline.find((i) => i.type === 'contextual_tip' && i.tipId === 'connect_tools')
    return item ? { tipId: 'connect_tools', connector: item.connector, label: item.label } : null
  }, [timeline, dismissedTipIds, hasAgentText])

  const voiceInput = useMemo(() => {
    if (!hasAgentText) return false
    if (dismissedTipIds.includes('voice_input')) return false
    return timeline.some((i) => i.type === 'contextual_tip' && i.tipId === 'voice_input')
  }, [timeline, dismissedTipIds, hasAgentText])

  const directModeAvailable = useMemo(() => {
    if (!hasAgentText) return false
    if (dismissedTipIds.includes('direct_mode_available')) return false
    return timeline.some((i) => i.type === 'contextual_tip' && i.tipId === 'direct_mode_available')
  }, [timeline, dismissedTipIds, hasAgentText])

  return { connectTools, voiceInput, directModeAvailable }
}
