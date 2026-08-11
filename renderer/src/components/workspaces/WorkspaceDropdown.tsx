import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { FolderOpen, FolderX, Pencil } from 'lucide-react'
import type { WorkspaceSummary } from 'shared/local-api'
import { InlineInput } from '@/components/ui/InlineInput'
import { Modal, ModalContent } from '@/components/ui/Modal'
import { canManageVaults, useActivateVault, useForgetVault, useOpenVault, useRenameVault } from '@/hooks/useWorkspaces'

interface WorkspaceDropdownProps {
  workspaceId: string | undefined
  workspaces: WorkspaceSummary[]
  isLoading: boolean
}

export function WorkspaceDropdown({ workspaceId, workspaces, isLoading }: WorkspaceDropdownProps) {
  const workspace = workspaces.find((candidate) => candidate.id === workspaceId)
  const navigate = useNavigate()
  const activateVault = useActivateVault()
  const openVault = useOpenVault()
  const renameVault = useRenameVault()
  const forgetVault = useForgetVault()
  const [isEditing, setIsEditing] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [showForgetConfirm, setShowForgetConfirm] = useState(false)
  const canManage = canManageVaults()

  const selectWorkspace = async (selected: WorkspaceSummary) => {
    setIsOpen(false)
    const activated = await activateVault.mutateAsync(selected.id)
    if (activated) navigate(`/w/${activated.urlId}`)
  }

  const openFolder = async () => {
    setIsOpen(false)
    const opened = await openVault.mutateAsync(undefined)
    if (opened) navigate(`/w/${opened.urlId}`)
  }

  const rename = async (label: string) => {
    setIsEditing(false)
    if (!workspace || !label.trim() || label.trim() === workspace.name) return
    await renameVault.mutateAsync({ workspaceId: workspace.id, label: label.trim() })
  }

  const forget = async () => {
    if (!workspace) return
    await forgetVault.mutateAsync(workspace.id)
    setShowForgetConfirm(false)
    navigate('/')
  }

  if (!workspace || isLoading) {
    return <div className="h-6 flex-1 animate-pulse rounded bg-block-highlight" />
  }

  return (
    <>
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <InlineInput
            value={workspace.name}
            onSave={(value) => void rename(value)}
            onCancel={() => setIsEditing(false)}
            placeholder="Vault label…"
          />
        ) : (
          <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen} modal={false}>
            <DropdownMenu.Trigger asChild>
              <button className="flex w-full min-w-0 cursor-pointer items-center gap-2 text-md font-bold text-foreground outline-none transition-colors hover:text-foreground-muted">
                <span className="truncate">{workspace.name}</span>
                <i className="fa-solid fa-chevron-down shrink-0 text-[8px] text-foreground/70" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[230px] rounded-lg border border-outline bg-canvas p-1 shadow-lg"
                sideOffset={5}
                align="start"
              >
                {workspaces.map((candidate) => (
                  <DropdownMenu.Item
                    key={candidate.id}
                    className={`flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm outline-none ${
                      candidate.id === workspace.id
                        ? 'bg-block-highlight text-foreground'
                        : 'text-foreground hover:bg-block-hover'
                    }`}
                    onSelect={() => void selectWorkspace(candidate)}
                  >
                    <span className="truncate">{candidate.name}</span>
                    {candidate.id === workspace.id && <i className="fa-solid fa-check ml-auto text-[12px]" />}
                  </DropdownMenu.Item>
                ))}

                <DropdownMenu.Separator className="my-1 h-px bg-outline" />

                <DropdownMenu.Item
                  disabled={!canManage}
                  className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm text-foreground outline-none hover:bg-block-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
                  onSelect={() => void openFolder()}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span>Open Folder…</span>
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  disabled={!canManage}
                  className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm text-foreground outline-none hover:bg-block-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
                  onSelect={() => {
                    setIsOpen(false)
                    setIsEditing(true)
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit label</span>
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  disabled={!canManage}
                  className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm text-red-500 outline-none hover:bg-block-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
                  onSelect={() => {
                    setIsOpen(false)
                    setShowForgetConfirm(true)
                  }}
                >
                  <FolderX className="h-3.5 w-3.5" />
                  <span>Remove from Kanwas</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      <Modal isOpen={showForgetConfirm} onClose={() => setShowForgetConfirm(false)}>
        <ModalContent maxWidth="sm">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-block-highlight p-2">
                <FolderX className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold">Remove this vault?</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-foreground/65">
              Kanwas will forget <strong>{workspace.name}</strong>. The folder and every file inside it will remain on
              your computer.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md px-4 py-2 text-sm hover:bg-block-hover"
                onClick={() => setShowForgetConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                disabled={forgetVault.isPending}
                onClick={() => void forget()}
              >
                {forgetVault.isPending ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  )
}
