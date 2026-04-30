import { describe, expect, it } from 'vitest'
import type { ToolkitStatus } from '@/api/connections'
import { sortConnectionsBySearchRelevance } from '@/components/ui/ConnectionsModal/useConnectionsCatalog'

function createConnection(overrides: Partial<ToolkitStatus>): ToolkitStatus {
  return {
    toolkit: 'toolkit',
    displayName: 'Connection',
    description: '',
    categories: [],
    isConnected: false,
    isNoAuth: false,
    ...overrides,
  }
}

describe('connections catalog search sorting', () => {
  it('prioritizes display name matches over description-only matches', () => {
    const connections = [
      createConnection({
        toolkit: 'google-sheets',
        displayName: 'Google Sheets',
        description: 'Export reports to Slack channels',
        isConnected: true,
      }),
      createConnection({
        toolkit: 'slack',
        displayName: 'Slack',
        description: 'Team chat and notifications',
      }),
      createConnection({
        toolkit: 'slack-admin',
        displayName: 'Slack Admin',
        description: 'Manage workspace settings',
        isConnected: true,
      }),
    ]

    const sorted = sortConnectionsBySearchRelevance(connections, 'slack')

    expect(sorted.map((connection) => connection.toolkit)).toEqual(['slack', 'slack-admin', 'google-sheets'])
  })

  it('keeps installed connections first within the same name match tier', () => {
    const connections = [
      createConnection({ toolkit: 'slack-z', displayName: 'Slack Zeta' }),
      createConnection({ toolkit: 'slack-a', displayName: 'Slack Alpha', isConnected: true }),
      createConnection({ toolkit: 'slack-b', displayName: 'Slack Beta', isConnected: true }),
    ]

    const sorted = sortConnectionsBySearchRelevance(connections, 'slack')

    expect(sorted.map((connection) => connection.toolkit)).toEqual(['slack-a', 'slack-b', 'slack-z'])
  })

  it('falls back to installed-first alphabetical sorting when search is empty', () => {
    const connections = [
      createConnection({ toolkit: 'b', displayName: 'Beta', isConnected: true }),
      createConnection({ toolkit: 'a', displayName: 'Alpha' }),
      createConnection({ toolkit: 'c', displayName: 'Charlie', isConnected: true }),
    ]

    const sorted = sortConnectionsBySearchRelevance(connections, '')

    expect(sorted.map((connection) => connection.toolkit)).toEqual(['b', 'c', 'a'])
  })
})
