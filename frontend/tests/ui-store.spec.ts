import { describe, expect, it } from 'vitest'
import { DEFAULT_UI_STATE, coerceStoredUIState } from '@/store/useUIStore'

describe('coerceStoredUIState', () => {
  it('fills missing explorer split state from defaults for legacy blobs', () => {
    const state = coerceStoredUIState({
      sidebarOpen: false,
      zenMode: true,
      fullScreenMode: false,
      sidebarWidth: 240,
      chatWidth: 560,
    })

    expect(state).toEqual({
      ...DEFAULT_UI_STATE,
      sidebarOpen: false,
      zenMode: true,
      sidebarWidth: 240,
      chatWidth: 560,
    })
  })

  it('falls back to defaults for invalid persisted values', () => {
    const state = coerceStoredUIState({
      sidebarOpen: 'yes',
      sidebarWidth: Infinity,
      chatWidth: 'wide',
      explorerSplitPercent: undefined,
    })

    expect(state).toEqual(DEFAULT_UI_STATE)
  })
})
