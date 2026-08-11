import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InviteAcceptPage } from '@/pages/InviteAcceptPage'
import { useAuthState } from '@/providers/auth'
import { useAcceptOrganizationInvite, useOrganizationInvitePreview } from '@/hooks/useInvites'

vi.mock('@/providers/auth', () => ({
  useAuthState: vi.fn(),
}))

vi.mock('@/hooks/useInvites', () => ({
  useAcceptOrganizationInvite: vi.fn(),
  useOrganizationInvitePreview: vi.fn(),
}))

const mockedUseAuthState = vi.mocked(useAuthState)
const mockedUseAcceptOrganizationInvite = vi.mocked(useAcceptOrganizationInvite)
const mockedUseOrganizationInvitePreview = vi.mocked(useOrganizationInvitePreview)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('InviteAcceptPage', () => {
  let root: Root
  let container: HTMLDivElement
  const acceptInviteMutateAsync = vi.fn(() => new Promise(() => undefined))
  const storage = new Map<string, string>()

  async function renderInvite(path = '/invite/invite-token') {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/invite/:token" element={<InviteAcceptPage />} />
          </Routes>
        </MemoryRouter>
      )
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    })

    mockedUseAuthState.mockReturnValue({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })

    mockedUseAcceptOrganizationInvite.mockReturnValue({
      mutateAsync: acceptInviteMutateAsync,
      isPending: false,
    } as never)

    mockedUseOrganizationInvitePreview.mockReturnValue({
      data: {
        organizationName: 'Acme Studio',
        inviteeName: 'Taylor Teammate',
        roleToGrant: 'member',
        expiresAt: '2026-05-15T00:00:00.000Z',
      },
      error: null,
      isLoading: false,
    } as never)

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    document.body.innerHTML = ''
    storage.clear()
    vi.unstubAllGlobals()
  })

  it('renders an organization-specific invite with create account as the primary action', async () => {
    await renderInvite()

    expect(document.body.textContent).toContain('Join this team on Kanwas')
    expect(document.body.textContent).toContain('Acme Studio')
    expect(document.body.textContent).toContain('Taylor Teammate')
    expect(document.body.textContent).toContain('Member')
    expect(document.body.textContent).toContain('Expires')

    const links = Array.from(document.querySelectorAll('a'))
    expect(links[0]?.textContent?.trim()).toBe('Create account')
    expect(links[0]?.getAttribute('href')).toBe('/register')
    expect(links[1]?.textContent?.trim()).toBe('Sign in')
    expect(links[1]?.getAttribute('href')).toBe('/login')
  })

  it('renders an invalid invite error card', async () => {
    mockedUseOrganizationInvitePreview.mockReturnValue({
      data: undefined,
      error: new Error('Invite token is invalid, expired, revoked, or already used'),
      isLoading: false,
    } as never)

    await renderInvite()

    expect(document.body.textContent).toContain('Invalid invite link')
    expect(document.body.textContent).toContain('Invite token is invalid, expired, revoked, or already used')
    expect(document.querySelector('a[href="/"]')?.textContent?.trim()).toBe('Go to workspace')
  })

  it('renders the joining state and attempts acceptance for authenticated users', async () => {
    mockedUseAuthState.mockReturnValue({
      token: 'token',
      user: { id: 'user-1', email: 'user@example.com', name: 'User Name' },
      isAuthenticated: true,
      isLoading: false,
    })

    await renderInvite()

    expect(document.body.textContent).toContain('Joining team')
    expect(document.body.textContent).toContain('Accepting your invite to Acme Studio')
    expect(acceptInviteMutateAsync).toHaveBeenCalledWith('invite-token')
  })
})
