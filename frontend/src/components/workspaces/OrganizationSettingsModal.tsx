import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, ModalContent } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useOrganization } from '@/hooks/useOrganizations'
import { toUrlUuid } from '@/utils/uuid'
import { TeamSwitcherSidebar } from './team-settings/TeamSwitcherSidebar'
import { useTeamSidebarResize } from './team-settings/useTeamSidebarResize'
import { ProfileSection } from './team-settings/ProfileSection'
import { TeamNameSection } from './team-settings/TeamNameSection'
import { MembersSection } from './team-settings/MembersSection'
import { InvitesSection } from './team-settings/InvitesSection'
import { UsageSection } from './team-settings/UsageSection'

interface OrganizationSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceId?: string
}

export function OrganizationSettingsModal({ isOpen, onClose, workspaceId }: OrganizationSettingsModalProps) {
  const { data: organization } = useOrganization(workspaceId)
  const isAdmin = organization?.role === 'admin'
  const navigate = useNavigate()
  const layoutRef = useRef<HTMLDivElement>(null)

  const { teamSidebarWidth, isTeamSidebarResizing, handleTeamSidebarResizeStart } = useTeamSidebarResize({
    isOpen,
    containerRef: layoutRef,
  })

  const handleSwitchTeam = (targetWorkspaceId: string) => {
    onClose()
    navigate(`/w/${toUrlUuid(targetWorkspaceId)}`)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-[90vw] max-w-[52rem]">
        <ModalContent maxWidth="5xl">
          <div className="flex items-start justify-between border-b border-outline px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-outline bg-editor">
                <i className="fa-solid fa-users text-sm text-foreground-muted" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">Team settings</h2>
                <p className="text-xs text-foreground-muted">Manage your profile, members, and invite links.</p>
              </div>
            </div>

            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark text-foreground-muted" />
            </Button>
          </div>

          <div ref={layoutRef} className="flex flex-1 overflow-hidden">
            <TeamSwitcherSidebar
              width={teamSidebarWidth}
              isResizing={isTeamSidebarResizing}
              currentOrganizationId={organization?.id}
              onSwitchTeam={handleSwitchTeam}
              onResizeStart={handleTeamSidebarResizeStart}
            />

            <div className="min-w-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ProfileSection isOpen={isOpen} />
                <TeamNameSection workspaceId={workspaceId} isOpen={isOpen} />
              </div>
              <UsageSection workspaceId={workspaceId} isOpen={isOpen} />
              <MembersSection workspaceId={workspaceId} isAdmin={isAdmin} isOpen={isOpen} />
              <InvitesSection workspaceId={workspaceId} isAdmin={isAdmin} isOpen={isOpen} />
            </div>
          </div>
        </ModalContent>
      </div>
    </Modal>
  )
}
