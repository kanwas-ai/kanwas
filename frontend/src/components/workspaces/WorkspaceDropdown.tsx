import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  useWorkspace,
  useUpdateWorkspace,
  useDeleteWorkspace,
  useCreateWorkspace,
  useDuplicateWorkspace,
} from '@/hooks/useWorkspaces'
import { useOrganization } from '@/hooks/useOrganizations'
import { useAuth } from '@/providers/auth'
import { InlineInput } from '../ui/InlineInput'
import { DeleteConfirmation } from '../ui/DeleteConfirmation'
import { OrganizationSettingsModal } from './OrganizationSettingsModal'
import { toUrlUuid } from '@/utils/uuid'
import type { Workspace } from '@/api/client'

interface WorkspaceDropdownProps {
  workspaceId: string | undefined
  workspaces: Workspace[]
  isLoading: boolean
}

export function WorkspaceDropdown({ workspaceId, workspaces, isLoading }: WorkspaceDropdownProps) {
  const { data: workspace } = useWorkspace(workspaceId)
  const { data: organization } = useOrganization(workspaceId)
  const updateMutation = useUpdateWorkspace()
  const deleteMutation = useDeleteWorkspace()
  const createMutation = useCreateWorkspace(workspaceId)
  const duplicateMutation = useDuplicateWorkspace()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showOrganizationSettings, setShowOrganizationSettings] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const canManageWorkspace = organization?.role === 'admin' || organization?.role === 'member'
  const canCreateAndDeleteWorkspace = organization?.role === 'admin' || organization?.role === 'member'

  // Filter workspaces to only show those in the current workspace's organization
  const orgWorkspaces = useMemo(() => {
    if (!workspace?.organizationId) return workspaces
    return workspaces.filter((ws) => ws.organizationId === workspace.organizationId)
  }, [workspaces, workspace?.organizationId])

  const handleRename = async (newName: string) => {
    if (!workspaceId || !newName.trim()) {
      setIsEditing(false)
      return
    }

    if (newName !== workspace?.name) {
      updateMutation.mutate({ id: workspaceId, name: newName })
    }
    setIsEditing(false)
  }

  const handleDelete = () => {
    if (!workspaceId || !workspace) return

    deleteMutation.mutate(workspaceId, {
      onSuccess: () => {
        setShowDeleteConfirm(false)
        navigate('/')
      },
    })
  }

  const handleWorkspaceSelect = (selectedWorkspaceId: string) => {
    navigate(`/w/${toUrlUuid(selectedWorkspaceId)}`)
    setIsOpen(false)
  }

  const handleCreateWorkspace = async () => {
    try {
      const newWorkspace = await createMutation.mutateAsync({
        name: 'New Workspace',
      })
      navigate(`/w/${toUrlUuid(newWorkspace.id)}`)
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to create workspace:', error)
    }
  }

  const handleDuplicate = async () => {
    if (!workspaceId) return
    try {
      const newWorkspace = await duplicateMutation.mutateAsync(workspaceId)
      navigate(`/w/${toUrlUuid(newWorkspace.id)}`)
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to duplicate workspace:', error)
    }
  }

  if (!workspace || isLoading) {
    return <div className="h-6 bg-block-highlight rounded animate-pulse flex-1" />
  }

  return (
    <>
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <InlineInput
            value={workspace.name}
            onSave={handleRename}
            onCancel={() => setIsEditing(false)}
            placeholder="Workspace name..."
          />
        ) : (
          <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen} modal={false}>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 text-md font-bold text-foreground hover:text-foreground-muted transition-colors cursor-pointer w-full min-w-0 outline-none">
                <span className="truncate">{workspace.name}</span>
                <i
                  className="fa-solid fa-chevron-down flex-shrink-0"
                  style={{ fontSize: '8px', color: 'color-mix(in srgb, var(--foreground) 70%, transparent)' }}
                />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[200px] bg-canvas border border-outline rounded-lg shadow-lg p-1 z-50"
                sideOffset={5}
                align="start"
              >
                {orgWorkspaces.map((ws) => (
                  <DropdownMenu.Item
                    key={ws.id}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none ${
                      ws.id === workspaceId
                        ? 'bg-block-highlight text-foreground'
                        : 'text-foreground hover:bg-block-hover'
                    }`}
                    onSelect={() => handleWorkspaceSelect(ws.id)}
                  >
                    <span className="truncate">{ws.name}</span>
                    {ws.id === workspaceId && <i className="fa-solid fa-check text-[12px] ml-auto" />}
                  </DropdownMenu.Item>
                ))}

                <DropdownMenu.Separator className="h-px bg-outline my-1" />

                {canCreateAndDeleteWorkspace && (
                  <>
                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none text-foreground hover:bg-block-hover"
                      onSelect={handleCreateWorkspace}
                    >
                      <i className="fa-solid fa-plus text-[12px]" />
                      <span>New Workspace</span>
                    </DropdownMenu.Item>

                    {canManageWorkspace && (
                      <>
                        <DropdownMenu.Separator className="h-px bg-outline my-1" />

                        <DropdownMenu.Item
                          className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none text-foreground hover:bg-block-hover"
                          onSelect={handleDuplicate}
                        >
                          <i className="fa-solid fa-copy text-[12px]" />
                          <span>Duplicate</span>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item
                          className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none text-foreground hover:bg-block-hover"
                          onSelect={() => {
                            setIsOpen(false)
                            setIsEditing(true)
                          }}
                        >
                          <i className="fa-solid fa-pen text-[12px]" />
                          <span>Rename</span>
                        </DropdownMenu.Item>
                      </>
                    )}

                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none text-red-500 hover:bg-block-hover"
                      onSelect={() => {
                        setIsOpen(false)
                        setShowDeleteConfirm(true)
                      }}
                    >
                      <i className="fa-solid fa-trash text-[12px]" />
                      <span>Delete</span>
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator className="h-px bg-outline my-1" />
                  </>
                )}

                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none text-foreground hover:bg-block-hover"
                  onSelect={() => {
                    setIsOpen(false)
                    setShowOrganizationSettings(true)
                  }}
                >
                  <i className="fa-solid fa-users text-[12px]" />
                  <span>Team settings</span>
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="h-px bg-outline my-1" />

                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none text-foreground hover:bg-block-hover"
                  onSelect={() => logout()}
                >
                  <i className="fa-solid fa-right-from-bracket text-[12px]" />
                  <span>Log out</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      {showDeleteConfirm && <DeleteConfirmation onDelete={handleDelete} onCancel={() => setShowDeleteConfirm(false)} />}
      {showOrganizationSettings && (
        <OrganizationSettingsModal
          isOpen={showOrganizationSettings}
          onClose={() => setShowOrganizationSettings(false)}
          workspaceId={workspaceId}
        />
      )}
    </>
  )
}
