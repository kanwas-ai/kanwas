import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentShareControl } from '@/components/canvas/nodes/DocumentShareControl'
import {
  useCreateDocumentShare,
  useDisableDocumentShare,
  useDocumentShare,
  useUpdateDocumentShare,
  useWorkspaceDocumentShares,
} from '@/hooks/useDocumentShares'
import type { DocumentShareOwnerState, WorkspaceDocumentSharesState } from 'shared/document-share'

vi.mock('@/hooks/useDocumentShares', () => ({
  useDocumentShare: vi.fn(),
  useCreateDocumentShare: vi.fn(),
  useUpdateDocumentShare: vi.fn(),
  useDisableDocumentShare: vi.fn(),
  useWorkspaceDocumentShares: vi.fn(),
}))

const mockedUseDocumentShare = vi.mocked(useDocumentShare)
const mockedUseCreateDocumentShare = vi.mocked(useCreateDocumentShare)
const mockedUseUpdateDocumentShare = vi.mocked(useUpdateDocumentShare)
const mockedUseDisableDocumentShare = vi.mocked(useDisableDocumentShare)
const mockedUseWorkspaceDocumentShares = vi.mocked(useWorkspaceDocumentShares)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function setTextInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((button) =>
    button.textContent?.trim().includes(label)
  ) as HTMLButtonElement | undefined
}

function buildInactiveOwnerState(): DocumentShareOwnerState {
  return {
    workspaceId: 'workspace-1',
    noteId: 'note-1',
    workspaceRedirectPath: '/w/workspace1',
    active: false,
    share: null,
  }
}

function buildWorkspaceDocumentSharesState(ownerState: DocumentShareOwnerState): WorkspaceDocumentSharesState {
  return {
    workspaceId: ownerState.workspaceId,
    shares: ownerState.share ? [ownerState.share] : [],
  }
}

describe('DocumentShareControl', () => {
  let root: Root
  let container: HTMLDivElement
  let ownerState: DocumentShareOwnerState
  let workspaceSharesState: WorkspaceDocumentSharesState
  let hasLoadedOwnerState: boolean
  let isShareQueryLoading: boolean
  const createMutateAsync = vi.fn()
  const updateMutateAsync = vi.fn()
  const disableMutateAsync = vi.fn()
  const clipboardWriteText = vi.fn().mockResolvedValue(undefined)
  const refetchShare = vi.fn().mockResolvedValue(undefined)

  const renderControl = async () => {
    await act(async () => {
      root.render(
        React.createElement(DocumentShareControl, {
          workspaceId: 'workspace-1',
          noteId: 'note-1',
          documentName: 'Launch Brief',
        })
      )
    })
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    ownerState = buildInactiveOwnerState()
    workspaceSharesState = buildWorkspaceDocumentSharesState(ownerState)
    hasLoadedOwnerState = false
    isShareQueryLoading = false

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    })

    mockedUseDocumentShare.mockImplementation(
      (_workspaceId, _noteId, options) =>
        ({
          data: options?.enabled
            ? isShareQueryLoading
              ? undefined
              : ((hasLoadedOwnerState = true), ownerState)
            : hasLoadedOwnerState
              ? ownerState
              : undefined,
          isLoading: Boolean(options?.enabled && isShareQueryLoading),
          isError: false,
          error: null,
          refetch: refetchShare,
        }) as never
    )

    mockedUseWorkspaceDocumentShares.mockImplementation(
      () =>
        ({
          data: workspaceSharesState,
          isLoading: false,
          isError: false,
          error: null,
        }) as never
    )

    mockedUseCreateDocumentShare.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    } as never)

    mockedUseUpdateDocumentShare.mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false,
    } as never)

    mockedUseDisableDocumentShare.mockReturnValue({
      mutateAsync: disableMutateAsync,
      isPending: false,
    } as never)

    createMutateAsync.mockImplementation(
      async ({ name, accessMode }: { name: string; accessMode: 'readonly' | 'editable' }) => {
        ownerState = {
          workspaceId: 'workspace-1',
          noteId: 'note-1',
          workspaceRedirectPath: '/w/workspace1',
          active: true,
          share: {
            id: 'share-1',
            workspaceId: 'workspace-1',
            noteId: 'note-1',
            name,
            createdByUserId: 'user-1',
            longHashId: 'long-hash-1',
            accessMode,
            publicPath: '/share/long-hash-1',
            workspaceRedirectPath: '/w/workspace1',
            createdAt: '2026-03-17T10:00:00.000Z',
            updatedAt: '2026-03-17T10:00:00.000Z',
          },
        }
        workspaceSharesState = buildWorkspaceDocumentSharesState(ownerState)

        return ownerState
      }
    )

    updateMutateAsync.mockImplementation(
      async ({ name, accessMode }: { name: string; accessMode: 'readonly' | 'editable' }) => {
        if (!ownerState.share) {
          throw new Error('Share missing')
        }

        ownerState = {
          ...ownerState,
          active: true,
          share: {
            ...ownerState.share,
            name,
            accessMode,
            updatedAt: '2026-03-17T10:05:00.000Z',
          },
        }
        workspaceSharesState = buildWorkspaceDocumentSharesState(ownerState)

        return ownerState
      }
    )

    disableMutateAsync.mockImplementation(async () => {
      ownerState = buildInactiveOwnerState()
      workspaceSharesState = buildWorkspaceDocumentSharesState(ownerState)
      return ownerState
    })

    await renderControl()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    document.body.innerHTML = ''
  })

  it('auto-creates an editable share link when the modal opens', async () => {
    isShareQueryLoading = true
    const shareButton = findButton('Share')
    expect(shareButton).toBeTruthy()
    expect(shareButton?.className).toContain('cursor-pointer')
    expect(mockedUseDocumentShare).toHaveBeenCalledWith('workspace-1', 'note-1', { enabled: false })

    await act(async () => {
      shareButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mockedUseDocumentShare).toHaveBeenLastCalledWith('workspace-1', 'note-1', { enabled: true })
    expect(document.body.textContent).toContain('Loading share settings')
    expect(document.body.textContent).not.toContain('Preparing share link')

    const loadingShareLinkInput = document.querySelector('#share-link-note-1') as HTMLInputElement
    expect(loadingShareLinkInput).toBeTruthy()
    expect(loadingShareLinkInput.value).toBe('')
    expect(loadingShareLinkInput.placeholder).toBe('Loading share settings')
    expect(loadingShareLinkInput.disabled).toBe(true)

    const loadingShareNameInput = document.querySelector('input[name="share-name"]') as HTMLInputElement
    expect(loadingShareNameInput).toBeTruthy()
    expect(loadingShareNameInput.disabled).toBe(true)

    const loadingAccessSelect = document.querySelector('select[name="share-access"]') as HTMLSelectElement
    expect(loadingAccessSelect).toBeTruthy()
    expect(loadingAccessSelect.disabled).toBe(true)

    const loadingCopyButton = findButton('Copy')
    expect(loadingCopyButton?.disabled).toBe(true)
    expect(createMutateAsync).not.toHaveBeenCalled()

    isShareQueryLoading = false

    await renderControl()

    expect(createMutateAsync).toHaveBeenCalledWith({
      name: 'Launch Brief',
      accessMode: 'editable',
    })

    await renderControl()

    const shareNameInput = document.querySelector('input[name="share-name"]') as HTMLInputElement
    expect(shareNameInput.value).toBe('Launch Brief')

    const accessSelect = document.querySelector('select[name="share-access"]') as HTMLSelectElement
    expect(accessSelect.value).toBe('editable')

    const shareLinkInput = document.querySelector('#share-link-note-1') as HTMLInputElement
    expect(shareLinkInput.value).toBe(`${window.location.origin}/share/long-hash-1`)

    await act(async () => {
      setTextInputValue(shareNameInput, 'Public Launch Brief')
    })

    await act(async () => {
      shareNameInput.focus()
      shareNameInput.blur()
    })

    await act(async () => {
      setSelectValue(accessSelect, 'readonly')
    })

    expect(updateMutateAsync).toHaveBeenNthCalledWith(1, {
      name: 'Public Launch Brief',
      accessMode: 'editable',
    })
    expect(updateMutateAsync).toHaveBeenNthCalledWith(2, {
      name: 'Public Launch Brief',
      accessMode: 'readonly',
    })

    const copyButton = findButton('Copy')
    expect(copyButton?.parentElement?.className).toContain('transition-[width]')

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(clipboardWriteText).toHaveBeenCalledWith(`${window.location.origin}/share/long-hash-1`)
    expect(document.body.textContent).toContain('Copied')
  })

  it('updates an active share and disables it from the same modal', async () => {
    ownerState = {
      workspaceId: 'workspace-1',
      noteId: 'note-1',
      workspaceRedirectPath: '/w/workspace1',
      active: true,
      share: {
        id: 'share-1',
        workspaceId: 'workspace-1',
        noteId: 'note-1',
        name: 'Public Launch Brief',
        createdByUserId: 'user-1',
        longHashId: 'long-hash-1',
        accessMode: 'readonly',
        publicPath: '/share/long-hash-1',
        workspaceRedirectPath: '/w/workspace1',
        createdAt: '2026-03-17T10:00:00.000Z',
        updatedAt: '2026-03-17T10:00:00.000Z',
      },
    }
    workspaceSharesState = buildWorkspaceDocumentSharesState(ownerState)

    await renderControl()

    const shareButton = findButton('Shared')
    expect(shareButton).toBeTruthy()
    expect(shareButton?.className).toContain('text-status-success')

    await act(async () => {
      shareButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const shareNameInput = document.querySelector('input[name="share-name"]') as HTMLInputElement
    expect(shareNameInput.value).toBe('Public Launch Brief')

    const accessSelect = document.querySelector('select[name="share-access"]') as HTMLSelectElement
    expect(accessSelect.value).toBe('readonly')

    await act(async () => {
      setSelectValue(accessSelect, 'editable')
    })

    expect(updateMutateAsync).toHaveBeenNthCalledWith(1, {
      name: 'Public Launch Brief',
      accessMode: 'editable',
    })

    await act(async () => {
      setTextInputValue(shareNameInput, 'Revised Launch Brief')
    })

    await act(async () => {
      shareNameInput.focus()
      shareNameInput.blur()
    })

    expect(updateMutateAsync).toHaveBeenNthCalledWith(2, {
      name: 'Revised Launch Brief',
      accessMode: 'editable',
    })

    const disableButton = findButton('Disable link')
    expect(disableButton?.className).toContain('cursor-pointer')

    await act(async () => {
      disableButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(disableMutateAsync).toHaveBeenCalledTimes(1)

    await renderControl()

    expect(findButton('Share')).toBeTruthy()
  })

  it('shows a green Shared trigger from the workspace share list before opening the modal', async () => {
    ownerState = {
      workspaceId: 'workspace-1',
      noteId: 'note-1',
      workspaceRedirectPath: '/w/workspace1',
      active: true,
      share: {
        id: 'share-1',
        workspaceId: 'workspace-1',
        noteId: 'note-1',
        name: 'Public Launch Brief',
        createdByUserId: 'user-1',
        longHashId: 'long-hash-1',
        accessMode: 'readonly',
        publicPath: '/share/long-hash-1',
        workspaceRedirectPath: '/w/workspace1',
        createdAt: '2026-03-17T10:00:00.000Z',
        updatedAt: '2026-03-17T10:00:00.000Z',
      },
    }
    workspaceSharesState = buildWorkspaceDocumentSharesState(ownerState)

    await renderControl()

    const shareButton = findButton('Shared')
    expect(shareButton).toBeTruthy()
    expect(shareButton?.className).toContain('text-status-success')
    expect(mockedUseDocumentShare).toHaveBeenCalledWith('workspace-1', 'note-1', { enabled: false })
  })

  it('falls back to Share after disable even before the workspace list refresh finishes', async () => {
    ownerState = {
      workspaceId: 'workspace-1',
      noteId: 'note-1',
      workspaceRedirectPath: '/w/workspace1',
      active: true,
      share: {
        id: 'share-1',
        workspaceId: 'workspace-1',
        noteId: 'note-1',
        name: 'Public Launch Brief',
        createdByUserId: 'user-1',
        longHashId: 'long-hash-1',
        accessMode: 'readonly',
        publicPath: '/share/long-hash-1',
        workspaceRedirectPath: '/w/workspace1',
        createdAt: '2026-03-17T10:00:00.000Z',
        updatedAt: '2026-03-17T10:00:00.000Z',
      },
    }
    workspaceSharesState = buildWorkspaceDocumentSharesState(ownerState)

    disableMutateAsync.mockImplementation(async () => {
      ownerState = buildInactiveOwnerState()
      return ownerState
    })

    await renderControl()

    const shareButton = findButton('Shared')
    expect(shareButton).toBeTruthy()

    await act(async () => {
      shareButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const disableButton = findButton('Disable link')
    expect(disableButton).toBeTruthy()

    await act(async () => {
      disableButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await renderControl()

    expect(findButton('Share')).toBeTruthy()
    expect(findButton('Shared')).toBeFalsy()
  })

  it('shows a friendly load error instead of the raw request URL', async () => {
    mockedUseDocumentShare.mockImplementation(
      (_workspaceId, _noteId, options) =>
        ({
          data: undefined,
          isLoading: false,
          isError: options?.enabled === true,
          error:
            options?.enabled === true
              ? new Error('Request failed with status code 500: GET /workspaces/workspace-1/notes/note-1/share')
              : null,
          refetch: refetchShare,
        }) as never
    )

    await renderControl()

    const shareButton = findButton('Share')
    expect(shareButton).toBeTruthy()

    await act(async () => {
      shareButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.body.textContent).toContain('Failed to load share settings')
    expect(document.body.textContent).not.toContain('/workspaces/workspace-1/notes/note-1/share')
    expect(document.querySelector('#share-link-note-1')).toBeNull()
    expect(document.querySelector('input[name="share-name"]')).toBeNull()
    expect(document.querySelector('select[name="share-access"]')).toBeNull()
    expect(findButton('Retry')).toBeTruthy()
  })
})
