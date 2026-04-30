import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { OrganizationSettingsModal } from '@/components/workspaces/OrganizationSettingsModal'
import { RemoveOrganizationMemberError } from '@/api/organizations'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import {
  useMyOrganizations,
  useOrganization,
  useOrganizationMembers,
  useRemoveOrganizationMember,
  useUpdateOrganizationMemberRole,
  useUpdateOrganization,
} from '@/hooks/useOrganizations'
import { useCreateOrganizationInvite, useOrganizationInvites, useRevokeOrganizationInvite } from '@/hooks/useInvites'
import { useMe, useUpdateProfileName } from '@/hooks/useMe'

vi.mock('@/hooks/useWorkspaces', () => ({
  useWorkspaces: vi.fn(),
}))

vi.mock('@/hooks/useOrganizations', () => ({
  useMyOrganizations: vi.fn(),
  useOrganization: vi.fn(),
  useUpdateOrganization: vi.fn(),
  useOrganizationMembers: vi.fn(),
  useUpdateOrganizationMemberRole: vi.fn(),
  useRemoveOrganizationMember: vi.fn(),
}))

vi.mock('@/hooks/useInvites', () => ({
  useOrganizationInvites: vi.fn(),
  useCreateOrganizationInvite: vi.fn(),
  useRevokeOrganizationInvite: vi.fn(),
}))

vi.mock('@/hooks/useMe', () => ({
  useMe: vi.fn(),
  useUpdateProfileName: vi.fn(),
}))

const mockedUseWorkspaces = vi.mocked(useWorkspaces)
const mockedUseMyOrganizations = vi.mocked(useMyOrganizations)
const mockedUseOrganization = vi.mocked(useOrganization)
const mockedUseUpdateOrganization = vi.mocked(useUpdateOrganization)
const mockedUseOrganizationMembers = vi.mocked(useOrganizationMembers)
const mockedUseUpdateOrganizationMemberRole = vi.mocked(useUpdateOrganizationMemberRole)
const mockedUseRemoveOrganizationMember = vi.mocked(useRemoveOrganizationMember)
const mockedUseOrganizationInvites = vi.mocked(useOrganizationInvites)
const mockedUseCreateOrganizationInvite = vi.mocked(useCreateOrganizationInvite)
const mockedUseRevokeOrganizationInvite = vi.mocked(useRevokeOrganizationInvite)
const mockedUseMe = vi.mocked(useMe)
const mockedUseUpdateProfileName = vi.mocked(useUpdateProfileName)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function setTextInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('OrganizationSettingsModal', () => {
  let root: Root
  let container: HTMLDivElement

  const updateOrganizationMutateAsync = vi.fn().mockResolvedValue(undefined)
  const updateProfileNameMutateAsync = vi
    .fn()
    .mockResolvedValue({ id: 'user-owner', email: 'owner@example.com', name: 'Updated Owner' })
  const removeMemberMutateAsync = vi.fn().mockResolvedValue({ removedUserId: 'user-2' })
  const createInviteMutateAsync = vi.fn().mockResolvedValue({
    token: 'invite-token',
    invite: {
      id: 'invite-2',
      organizationId: 'org-1',
      inviteeName: 'New Teammate',
      roleToGrant: 'member',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      consumedAt: null,
      consumedByUserId: null,
      createdBy: 'user-owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })
  const revokeInviteMutateAsync = vi.fn().mockResolvedValue(undefined)

  beforeEach(async () => {
    vi.clearAllMocks()

    mockedUseWorkspaces.mockReturnValue({
      data: [
        { id: 'ws-1', name: 'Workspace One', organizationId: 'org-1' },
        { id: 'ws-1b', name: 'Workspace One B', organizationId: 'org-1' },
        { id: 'ws-2', name: 'Workspace Two', organizationId: 'org-2' },
      ],
      isLoading: false,
    } as never)

    mockedUseOrganization.mockReturnValue({
      data: {
        id: 'org-1',
        name: 'Org Name',
        role: 'admin',
        billingCycleAnchorUtc: '2026-02-01T00:00:00.000Z',
        usage: {
          weekly: {
            usedCents: 1450,
            limitCents: 1250,
            remainingCents: 0,
            percent: 100,
            periodStartUtc: '2026-03-01T00:00:00.000Z',
            periodEndUtc: '2026-03-08T00:00:00.000Z',
          },
          monthly: {
            usedCents: 5000,
            limitCents: 5000,
            remainingCents: 0,
            percent: 100,
            periodStartUtc: '2026-03-01T00:00:00.000Z',
            periodEndUtc: '2026-04-01T00:00:00.000Z',
          },
          isOutOfUsage: true,
          lastSyncedAt: '2026-03-05T10:15:00.000Z',
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    mockedUseMyOrganizations.mockReturnValue({
      data: [
        {
          id: 'org-1',
          name: 'Org Name',
          role: 'admin',
          defaultWorkspaceId: 'ws-1',
        },
        {
          id: 'org-2',
          name: 'Another Team',
          role: 'member',
          defaultWorkspaceId: 'ws-2',
        },
      ],
      isLoading: false,
    } as never)

    mockedUseMe.mockReturnValue({ data: { id: 'user-owner', email: 'owner@example.com', name: 'Owner Name' } } as never)

    mockedUseOrganizationMembers.mockReturnValue({
      data: [
        {
          id: 'member-1',
          organizationId: 'org-1',
          userId: 'user-owner',
          role: 'admin',
          name: 'Owner Name',
          email: 'owner@example.com',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'member-2',
          organizationId: 'org-1',
          userId: 'user-2',
          role: 'admin',
          name: 'Second Admin',
          email: 'admin@example.com',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    mockedUseOrganizationInvites.mockReturnValue({
      data: [
        {
          id: 'invite-1',
          organizationId: 'org-1',
          inviteeName: 'Taylor Teammate',
          roleToGrant: 'member',
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          revokedAt: null,
          consumedAt: null,
          consumedByUserId: null,
          createdBy: 'user-owner',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    mockedUseUpdateOrganization.mockReturnValue({
      mutateAsync: updateOrganizationMutateAsync,
      isPending: false,
    } as never)

    mockedUseUpdateProfileName.mockReturnValue({
      mutateAsync: updateProfileNameMutateAsync,
      isPending: false,
    } as never)

    mockedUseRemoveOrganizationMember.mockReturnValue({
      mutateAsync: removeMemberMutateAsync,
      isPending: false,
    } as never)

    mockedUseUpdateOrganizationMemberRole.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)

    mockedUseCreateOrganizationInvite.mockReturnValue({
      mutateAsync: createInviteMutateAsync,
      isPending: false,
    } as never)

    mockedUseRevokeOrganizationInvite.mockReturnValue({
      mutateAsync: revokeInviteMutateAsync,
      isPending: false,
    } as never)

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(
          MemoryRouter,
          undefined,
          React.createElement(OrganizationSettingsModal, { isOpen: true, onClose: vi.fn(), workspaceId: 'ws-1' })
        )
      )
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('updates profile name from settings modal', async () => {
    const profileNameInput = document.querySelector('input[placeholder="Your name"]') as HTMLInputElement
    expect(profileNameInput).toBeTruthy()

    await act(async () => {
      setTextInputValue(profileNameInput, '  Updated Owner  ')
    })

    const profileSection = profileNameInput.closest('section') as HTMLElement | null
    const saveProfileButton = Array.from(profileSection?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent?.trim() === 'Save'
    ) as HTMLButtonElement | undefined

    expect(saveProfileButton).toBeTruthy()
    expect(saveProfileButton?.disabled).toBe(false)

    await act(async () => {
      saveProfileButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateProfileNameMutateAsync).toHaveBeenCalledWith('Updated Owner')
  })

  it('shows deterministic last-admin error when member removal is blocked', async () => {
    removeMemberMutateAsync.mockRejectedValueOnce(
      new RemoveOrganizationMemberError('Cannot remove the last remaining admin', 'LAST_ADMIN_REMOVAL_BLOCKED')
    )

    const actionButton = document.querySelector('button[aria-label="Actions for Second Admin"]') as HTMLButtonElement
    expect(actionButton).toBeTruthy()

    await act(async () => {
      actionButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      actionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const removeMenuItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find((element) =>
      element.textContent?.includes('Remove from team')
    ) as HTMLElement | undefined

    expect(removeMenuItem).toBeTruthy()

    await act(async () => {
      removeMenuItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const confirmRemoveButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Remove member' && !button.getAttribute('aria-label')
    ) as HTMLButtonElement | undefined
    expect(confirmRemoveButton).toBeTruthy()

    await act(async () => {
      confirmRemoveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(removeMemberMutateAsync).toHaveBeenCalledWith('user-2')
    expect(document.body.textContent).toContain('You cannot remove the last admin')
  })

  it('does not render a remove action for the current user', () => {
    const selfRemoveButton = document.querySelector(
      'button[aria-label="Actions for Owner Name"]'
    ) as HTMLButtonElement | null

    expect(selfRemoveButton).toBeNull()
  })

  it('uses the wider organization settings modal width', () => {
    const modalContent = document.querySelector('div[class*="max-w-5xl"]') as HTMLDivElement | null
    expect(modalContent).toBeTruthy()
  })

  it('renders invitee names and creates invite links from settings modal', async () => {
    expect(document.body.textContent).toContain('Taylor Teammate')

    const openCreateLinkButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Create invite link'
    ) as HTMLButtonElement | undefined

    expect(openCreateLinkButton).toBeTruthy()

    await act(async () => {
      openCreateLinkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(createInviteMutateAsync).toHaveBeenCalledWith({ roleToGrant: 'member' })
    expect(document.body.textContent).toContain('Latest generated invite link')
  })

  it('renders weekly and monthly usage bars with exhausted state messaging', () => {
    const usageSection = document.querySelector('[data-testid="organization-usage-section"]') as HTMLElement | null

    expect(usageSection).toBeTruthy()
    expect(usageSection?.textContent).toContain('Weekly usage limit')
    expect(usageSection?.textContent).toContain('Monthly usage limit')
    expect(usageSection?.textContent).toContain('% remaining')
    expect(usageSection?.textContent).toContain('Resets')
    expect(usageSection?.textContent).toContain('Out of usage right now')
    expect(usageSection?.textContent).toContain('run agents again after')

    const progressBars = usageSection?.querySelectorAll('[role="progressbar"]')
    expect(progressBars?.length).toBe(2)
  })

  it('keeps usage section free of monetary and legacy metadata labels', () => {
    const usageSection = document.querySelector('[data-testid="organization-usage-section"]') as HTMLElement | null
    const usageText = usageSection?.textContent ?? ''

    expect(usageText).not.toContain('Usage is currently available.')
    expect(usageText).not.toContain('Billing anchor (read-only)')
    expect(usageText).not.toContain('$')
    expect(usageText).not.toContain('Used')
    expect(usageText).not.toContain('remainingCents')
  })
})
