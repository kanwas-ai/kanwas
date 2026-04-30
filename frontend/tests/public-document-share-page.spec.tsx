import React from 'react'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicDocumentSharePage } from '@/pages/PublicDocumentSharePage'
import { resolvePublicDocumentShare } from '@/api/publicDocumentShares'
import { usePublicNoteBlockNoteBinding } from '@/hooks/usePublicNoteBlockNoteBinding'
import { usePublicNote } from '@/providers/public-note'
import { useTheme } from '@/providers/theme'

vi.mock('@/api/publicDocumentShares', () => ({
  resolvePublicDocumentShare: vi.fn(),
}))

vi.mock('@/providers/public-note', () => ({
  PublicNoteProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  usePublicNote: vi.fn(),
}))

vi.mock('@/providers/theme', () => ({
  useTheme: vi.fn(),
}))

vi.mock('@/hooks/usePublicNoteBlockNoteBinding', () => ({
  usePublicNoteBlockNoteBinding: vi.fn(),
}))

vi.mock('@/components/public-note/PublicDocumentNoteSurface', () => ({
  PublicDocumentNoteSurface: ({ share }: { share: { noteId: string } }) =>
    React.createElement('div', { 'data-testid': 'public-note-surface' }, share.noteId),
}))

vi.mock('@/lib/guestAwarenessIdentity', () => ({
  guestAwarenessIdentityManager: {
    getGuest: () => ({
      id: 'guest-1',
      name: 'Guest Cedar',
      color: '#10b981',
      isGuest: true,
    }),
  },
}))

const mockedResolvePublicDocumentShare = vi.mocked(resolvePublicDocumentShare)
const mockedUsePublicNoteBlockNoteBinding = vi.mocked(usePublicNoteBlockNoteBinding)
const mockedUsePublicNote = vi.mocked(usePublicNote)
const mockedUseTheme = vi.mocked(useTheme)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
}

describe('PublicDocumentSharePage', () => {
  let root: Root
  let container: HTMLDivElement

  const renderPage = async (initialPath = '/share/hash-1') => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/share/:longHashId" element={<PublicDocumentSharePage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })

    await flushPromises()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    mockedUseTheme.mockReturnValue({
      theme: { mode: 'light', blockNote: {} as never },
      themeMode: 'light',
      toggleTheme: vi.fn(),
      setThemeMode: vi.fn(),
    })

    mockedUsePublicNote.mockReturnValue({
      yDoc: {} as never,
      provider: {} as never,
      workspaceId: 'workspace-1',
      noteId: 'note-1',
      longHashId: 'hash-1',
      hasInitiallySynced: true,
      initialSyncError: null,
      isConnected: true,
    })

    mockedUsePublicNoteBlockNoteBinding.mockReturnValue({
      fragment: {} as never,
      editorKey: 'editor-1',
      collaborationProvider: {} as never,
      undoManager: {} as never,
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    document.body.innerHTML = ''
  })

  it('renders the standalone note page for an active editable share', async () => {
    mockedResolvePublicDocumentShare.mockResolvedValue({
      longHashId: 'hash-1',
      workspaceId: 'workspace-1',
      noteId: 'note-1',
      name: 'Release brief',
      accessMode: 'editable',
      publicPath: '/share/hash-1',
      workspaceRedirectPath: '/w/workspace1',
      active: true,
      revoked: false,
      status: 'active',
    })

    await renderPage()

    expect(mockedResolvePublicDocumentShare).toHaveBeenCalledWith('hash-1')
    const header = document.querySelector('header')
    expect(header?.textContent).toContain('Release brief')
    expect(header?.textContent).toContain('Can edit')
    expect(header?.textContent).toContain('Live')
    expect(header?.textContent).not.toContain('Guest Cedar')
    expect(document.querySelector('[data-testid="public-note-surface"]')?.textContent).toBe('note-1')

    const openInKanwasLink = document.querySelector('a[href="/w/workspace1"]') as HTMLAnchorElement | null
    expect(openInKanwasLink).toBeTruthy()
    expect(openInKanwasLink?.textContent).toContain('Open in Kanwas')
  })

  it('keeps the first loading state visible until the note is ready', async () => {
    mockedUsePublicNote.mockReturnValue({
      yDoc: {} as never,
      provider: {} as never,
      workspaceId: 'workspace-1',
      noteId: 'note-1',
      longHashId: 'hash-1',
      hasInitiallySynced: false,
      initialSyncError: null,
      isConnected: false,
    })

    mockedResolvePublicDocumentShare.mockResolvedValue({
      longHashId: 'hash-1',
      workspaceId: 'workspace-1',
      noteId: 'note-1',
      name: 'Release brief',
      accessMode: 'editable',
      publicPath: '/share/hash-1',
      workspaceRedirectPath: '/w/workspace1',
      active: true,
      revoked: false,
      status: 'active',
    })

    await renderPage()

    expect(document.body.textContent).toContain('Opening the shared note')
    expect(document.body.textContent).not.toContain('Connecting to the note')
    expect(document.querySelector('[data-testid="public-note-surface"]')).toBeNull()
  })

  it('uses the dark preference for the share page shell', async () => {
    mockedUseTheme.mockReturnValue({
      theme: { mode: 'dark', blockNote: {} as never },
      themeMode: 'dark',
      toggleTheme: vi.fn(),
      setThemeMode: vi.fn(),
    })

    mockedResolvePublicDocumentShare.mockResolvedValue({
      longHashId: 'hash-1',
      workspaceId: 'workspace-1',
      noteId: 'note-1',
      name: 'Release brief',
      accessMode: 'editable',
      publicPath: '/share/hash-1',
      workspaceRedirectPath: '/w/workspace1',
      active: true,
      revoked: false,
      status: 'active',
    })

    await renderPage()

    expect(document.querySelector('main')?.style.colorScheme).toBe('dark')
    expect(document.documentElement.style.backgroundColor).toBe('var(--editor)')
    expect(document.body.style.backgroundColor).toBe('var(--editor)')
  })

  it('renders a revoked state with the workspace handoff', async () => {
    mockedResolvePublicDocumentShare.mockResolvedValue({
      longHashId: 'hash-1',
      workspaceId: 'workspace-1',
      noteId: 'note-1',
      name: 'Release brief',
      accessMode: 'readonly',
      publicPath: '/share/hash-1',
      workspaceRedirectPath: '/w/workspace1',
      active: false,
      revoked: true,
      status: 'revoked',
    })

    await renderPage()

    expect(document.body.textContent).toContain('This shared link has been turned off')
    expect(document.querySelector('[data-testid="public-note-surface"]')).toBeNull()

    const openInKanwasLink = document.querySelector('a[href="/w/workspace1"]') as HTMLAnchorElement | null
    expect(openInKanwasLink).toBeTruthy()
  })

  it('renders a missing-share state without mounting the note surface', async () => {
    mockedResolvePublicDocumentShare.mockResolvedValue({
      longHashId: 'hash-1',
      publicPath: '/share/hash-1',
      active: false,
      revoked: false,
      status: 'not_found',
    })

    await renderPage()

    expect(document.body.textContent).toContain('This shared note does not exist')
    expect(document.querySelector('[data-testid="public-note-surface"]')).toBeNull()
  })
})
