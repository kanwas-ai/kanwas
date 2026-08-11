import { beforeEach, describe, expect, it } from 'vitest'
import {
  getLastOrganization,
  getLastWorkspace,
  getLastWorkspaceForOrganization,
  getOrganizationForWorkspace,
  rememberWorkspaceVisit,
} from '@/hooks/workspaceStorage'
import { resolveWorkspaceRedirect } from '@/lib/workspaceRedirect'

const workspaces = [
  { id: 'ws-1', organizationId: 'org-1' },
  { id: 'ws-2', organizationId: 'org-1' },
  { id: 'ws-3', organizationId: 'org-2' },
]

describe('workspace redirect state', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
        removeItem: (key: string) => {
          storage.delete(key)
        },
      },
    })
  })

  it('remembers the last opened workspace and organization together', () => {
    rememberWorkspaceVisit('ws-2', 'org-1')

    expect(getLastWorkspace()).toBe('ws-2')
    expect(getLastOrganization()).toBe('org-1')
    expect(getLastWorkspaceForOrganization('org-1')).toBe('ws-2')
    expect(getOrganizationForWorkspace('ws-2')).toBe('org-1')
  })

  it('prefers the exact remembered workspace when it still exists', () => {
    rememberWorkspaceVisit('ws-2', 'org-1')

    const target = resolveWorkspaceRedirect(workspaces, {
      preferredWorkspaceIds: [getLastWorkspace()],
      preferredOrganizationIds: [getLastOrganization()],
    })

    expect(target?.id).toBe('ws-2')
  })

  it('falls back to another workspace in the same organization when the last workspace is gone', () => {
    rememberWorkspaceVisit('ws-2', 'org-1')

    const target = resolveWorkspaceRedirect(
      [
        { id: 'ws-1', organizationId: 'org-1' },
        { id: 'ws-3', organizationId: 'org-2' },
      ],
      {
        preferredWorkspaceIds: [
          getLastWorkspace(),
          getLastOrganization() ? getLastWorkspaceForOrganization(getLastOrganization()!) : null,
        ],
        preferredOrganizationIds: [getLastOrganization()],
      }
    )

    expect(target?.id).toBe('ws-1')
  })

  it('falls back to some other workspace when the remembered organization is gone', () => {
    rememberWorkspaceVisit('ws-2', 'org-1')

    const target = resolveWorkspaceRedirect([{ id: 'ws-3', organizationId: 'org-2' }], {
      preferredWorkspaceIds: [
        getLastWorkspace(),
        getLastOrganization() ? getLastWorkspaceForOrganization(getLastOrganization()!) : null,
      ],
      preferredOrganizationIds: [getLastOrganization()],
    })

    expect(target?.id).toBe('ws-3')
  })

  it('uses the remembered workspace inside the selected organization before the org default', () => {
    rememberWorkspaceVisit('ws-2', 'org-1')

    const target = resolveWorkspaceRedirect(workspaces, {
      preferredWorkspaceIds: [getLastWorkspaceForOrganization('org-1'), 'ws-1'],
      preferredOrganizationIds: ['org-1'],
    })

    expect(target?.id).toBe('ws-2')
  })

  it('uses the invalid route workspace mapping to stay in the same organization', () => {
    rememberWorkspaceVisit('ws-2', 'org-1')

    const routeOrganizationId = getOrganizationForWorkspace('ws-2')
    const sameOrganizationTarget = resolveWorkspaceRedirect(
      [
        { id: 'ws-1', organizationId: 'org-1' },
        { id: 'ws-3', organizationId: 'org-2' },
      ],
      {
        preferredWorkspaceIds: [
          'ws-2',
          routeOrganizationId ? getLastWorkspaceForOrganization(routeOrganizationId) : null,
        ],
        preferredOrganizationIds: [routeOrganizationId],
        fallbackToFirstWorkspace: false,
      }
    )
    const target =
      sameOrganizationTarget ??
      resolveWorkspaceRedirect(
        [
          { id: 'ws-1', organizationId: 'org-1' },
          { id: 'ws-3', organizationId: 'org-2' },
        ],
        {
          preferredWorkspaceIds: ['ws-3'],
        }
      )

    expect(target?.id).toBe('ws-1')
  })
})
