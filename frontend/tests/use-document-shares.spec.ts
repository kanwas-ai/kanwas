import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreateDocumentShare, useDisableDocumentShare, useUpdateDocumentShare } from '@/hooks/useDocumentShares'
import type { DocumentShareOwnerState } from 'shared/document-share'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
  createDocumentShare: vi.fn(),
  updateDocumentShare: vi.fn(),
  disableDocumentShare: vi.fn(),
  listWorkspaceDocumentShares: vi.fn(),
}))

vi.mock('@/providers/auth', () => ({
  useAuth: () => mocks.useAuth(),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => mocks.useMutation(options),
  useQuery: (options: unknown) => mocks.useQuery(options),
  useQueryClient: () => mocks.useQueryClient(),
}))

vi.mock('@/api/documentShares', () => ({
  createDocumentShare: (...args: unknown[]) => mocks.createDocumentShare(...args),
  updateDocumentShare: (...args: unknown[]) => mocks.updateDocumentShare(...args),
  disableDocumentShare: (...args: unknown[]) => mocks.disableDocumentShare(...args),
  listWorkspaceDocumentShares: (...args: unknown[]) => mocks.listWorkspaceDocumentShares(...args),
}))

const ownerState: DocumentShareOwnerState = {
  workspaceId: 'workspace-1',
  noteId: 'note-1',
  workspaceRedirectPath: '/w/workspace1',
  active: false,
  share: null,
}

describe('useDocumentShares mutations', () => {
  const queryClient = {
    setQueryData: vi.fn(),
    fetchQuery: vi.fn().mockResolvedValue(undefined),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAuth.mockReturnValue({
      state: {
        isAuthenticated: true,
        isLoading: false,
      },
    })
    mocks.useQueryClient.mockReturnValue(queryClient)
    mocks.useMutation.mockImplementation((options: unknown) => options)
    mocks.useQuery.mockImplementation((options: unknown) => options)
    mocks.listWorkspaceDocumentShares.mockResolvedValue({
      workspaceId: 'workspace-1',
      shares: [],
    })
  })

  it.each([
    ['create', useCreateDocumentShare],
    ['update', useUpdateDocumentShare],
    ['disable', useDisableDocumentShare],
  ])('re-queries workspace shares after %s mutations', async (_label, useMutationHook) => {
    const mutation = useMutationHook('workspace-1', 'note-1') as {
      onSuccess: (ownerState: DocumentShareOwnerState) => Promise<void>
    }

    await mutation.onSuccess(ownerState)

    expect(queryClient.fetchQuery).toHaveBeenCalledWith({
      queryKey: ['workspace-document-shares', 'workspace-1'],
      queryFn: expect.any(Function),
    })

    const queryFn = queryClient.fetchQuery.mock.calls[0]?.[0]?.queryFn as (() => Promise<unknown>) | undefined
    expect(queryFn).toBeTruthy()

    await queryFn?.()

    expect(mocks.listWorkspaceDocumentShares).toHaveBeenCalledWith('workspace-1')
  })
})
