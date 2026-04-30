import { useUI } from '@/store/useUIStore'
import { WorkspaceDropdown } from './WorkspaceDropdown'
import type { Workspace } from '@/api/client'

interface WorkspaceHeaderProps {
  workspaceId: string | undefined
  workspaces: Workspace[]
  isLoading: boolean
}

export function WorkspaceHeader({ workspaceId, workspaces, isLoading }: WorkspaceHeaderProps) {
  const { closeSidebar } = useUI()

  return (
    <div className="pt-[18px] pb-2 px-4 flex items-center gap-2">
      <WorkspaceDropdown workspaceId={workspaceId} workspaces={workspaces} isLoading={isLoading} />

      <button
        onClick={closeSidebar}
        className="group p-1 pt-2 rounded transition-colors cursor-pointer flex-shrink-0 flex items-center justify-center"
        aria-label="Close sidebar"
      >
        <i
          className="fa-solid fa-sidebar text-sidebar-icon group-hover:text-foreground transition-colors"
          style={{ fontSize: '14px' }}
        />
      </button>
    </div>
  )
}
