import type { MouseEvent as ReactMouseEvent } from 'react'
import { useMyOrganizations } from '@/hooks/useOrganizations'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { getLastWorkspaceForOrganization } from '@/hooks/workspaceStorage'
import { resolveWorkspaceRedirect } from '@/lib/workspaceRedirect'

interface TeamSwitcherSidebarProps {
  width: number
  isResizing: boolean
  currentOrganizationId?: string
  onSwitchTeam: (workspaceId: string) => void
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void
}

export function TeamSwitcherSidebar({
  width,
  isResizing,
  currentOrganizationId,
  onSwitchTeam,
  onResizeStart,
}: TeamSwitcherSidebarProps) {
  const { data: organizations = [], isLoading } = useMyOrganizations()
  const { data: workspaces = [] } = useWorkspaces()

  return (
    <aside className="relative shrink-0 border-r border-outline bg-editor/30 p-3" style={{ width: `${width}px` }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-muted px-2 mb-2">Teams</p>
      <div className="space-y-0.5">
        {isLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-8 rounded-md bg-block-highlight animate-pulse" />
            ))
          : organizations.map((org) => {
              const isActive = org.id === currentOrganizationId
              return (
                <button
                  key={org.id}
                  onClick={() => {
                    if (isActive) {
                      return
                    }

                    const targetWorkspace = resolveWorkspaceRedirect(workspaces, {
                      preferredWorkspaceIds: [getLastWorkspaceForOrganization(org.id), org.defaultWorkspaceId],
                      preferredOrganizationIds: [org.id],
                      fallbackToFirstWorkspace: false,
                    })

                    if (targetWorkspace) {
                      onSwitchTeam(targetWorkspace.id)
                    }
                  }}
                  className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-left transition-colors outline-none ${
                    isActive
                      ? 'bg-block-highlight text-foreground font-medium cursor-default'
                      : 'text-foreground-muted hover:bg-block-hover hover:text-foreground cursor-pointer'
                  }`}
                >
                  <span className="truncate">{org.name}</span>
                </button>
              )
            })}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize teams sidebar"
        className="group absolute top-0 -right-2 z-20 h-full w-4 cursor-col-resize"
        onMouseDown={onResizeStart}
      >
        <div
          className={`absolute left-1/2 top-0 h-full -translate-x-1/2 transition-all ${
            isResizing ? 'w-1 bg-outline' : 'w-px bg-transparent group-hover:w-0.5 group-hover:bg-outline/80'
          }`}
        />
      </div>
    </aside>
  )
}
