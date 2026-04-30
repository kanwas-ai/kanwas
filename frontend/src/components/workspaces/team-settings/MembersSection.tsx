import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal, ModalContent } from '@/components/ui/Modal'
import {
  useOrganizationMembers,
  useRemoveOrganizationMember,
  useUpdateOrganizationMemberRole,
} from '@/hooks/useOrganizations'
import { useMe } from '@/hooks/useMe'
import { RemoveOrganizationMemberError } from '@/api/organizations'
import { MemberActionMenu } from './MemberActionMenu'
import { getRoleBadgeClasses, formatRoleLabel } from './utils'

interface MembersSectionProps {
  workspaceId?: string
  isAdmin: boolean
  isOpen: boolean
}

interface PendingRemoval {
  userId: string
  memberName: string
  memberEmail: string
}

function getMemberRemovalErrorMessage(error: unknown): string {
  if (error instanceof RemoveOrganizationMemberError) {
    if (error.code === 'LAST_ADMIN_REMOVAL_BLOCKED') {
      return 'You cannot remove the last admin. Promote another member to admin first.'
    }
    if (error.code === 'SELF_REMOVAL_FORBIDDEN') {
      return 'You cannot remove yourself from the team.'
    }
    if (error.code === 'MEMBER_NOT_FOUND') {
      return 'This member was already removed.'
    }
    return error.message
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return 'Failed to remove member.'
}

export function MembersSection({ workspaceId, isAdmin, isOpen }: MembersSectionProps) {
  const { data: me } = useMe(isOpen)
  const {
    data: members = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useOrganizationMembers(workspaceId, { enabled: isOpen })
  const removeMember = useRemoveOrganizationMember(workspaceId)
  const updateRole = useUpdateOrganizationMemberRole(workspaceId)

  const [memberActionError, setMemberActionError] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)

  const meId = me?.id

  const handleRemoveMember = async () => {
    if (!pendingRemoval) return

    const { userId } = pendingRemoval
    setMemberActionError(null)
    setRemovingUserId(userId)

    try {
      await removeMember.mutateAsync(userId)
    } catch (err) {
      setMemberActionError(getMemberRemovalErrorMessage(err))
    } finally {
      setRemovingUserId((current) => (current === userId ? null : current))
      setPendingRemoval(null)
    }
  }

  return (
    <>
      <section className="space-y-4 rounded-xl border border-outline bg-editor/60 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-muted">Access</p>
            <h3 className="text-sm font-semibold text-foreground">Members</h3>
            <p className="text-xs text-foreground-muted">People who have access to this team.</p>
          </div>
          <span className="inline-flex min-w-6 items-center justify-center rounded-full border border-outline bg-canvas px-2 py-0.5 text-[11px] font-medium text-foreground-muted">
            {members.length}
          </span>
        </div>

        {memberActionError && (
          <div className="rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-xs text-status-error">
            {memberActionError}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-12 rounded-md bg-block-highlight animate-pulse" />
            <div className="h-12 rounded-md bg-block-highlight animate-pulse" />
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-xs text-status-error space-y-2">
            <p>{error instanceof Error ? error.message : 'Unable to load members.'}</p>
            <Button size="sm" variant="secondary" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : members.length > 0 ? (
          <div className="space-y-2">
            {members.map((member) => (
              <div key={member.id} className="rounded-lg border border-outline bg-canvas px-3 py-2.5 sm:px-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium leading-tight text-foreground">{member.name}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${getRoleBadgeClasses(member.role)}`}
                      >
                        {formatRoleLabel(member.role)}
                      </span>
                      {meId === member.userId && (
                        <span className="rounded-full border border-outline bg-editor px-2 py-0.5 text-[12px] font-semibold text-foreground-muted">
                          You
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs leading-tight text-foreground-muted">{member.email}</p>
                  </div>

                  {isAdmin && Boolean(meId) && meId !== member.userId && (
                    <MemberActionMenu
                      memberName={member.name}
                      memberRole={member.role}
                      onRemove={() =>
                        setPendingRemoval({ userId: member.userId, memberName: member.name, memberEmail: member.email })
                      }
                      onChangeRole={(role) => {
                        setMemberActionError(null)
                        updateRole.mutate(
                          { userId: member.userId, role },
                          { onError: (err) => setMemberActionError(getMemberRemovalErrorMessage(err)) }
                        )
                      }}
                      isLoading={(removeMember.isPending && removingUserId === member.userId) || updateRole.isPending}
                      disabled={removeMember.isPending || updateRole.isPending}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-outline bg-canvas px-3 py-4 text-center text-xs text-foreground-muted">
            No members found.
          </div>
        )}
      </section>

      <Modal isOpen={pendingRemoval !== null} onClose={() => setPendingRemoval(null)} level={2}>
        <ModalContent maxWidth="sm">
          <div className="space-y-4 p-5">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-status-error">Confirm removal</p>
              <h3 className="text-base font-semibold text-foreground">Remove member from team?</h3>
              <p className="text-sm text-foreground-muted">
                {pendingRemoval?.memberName} ({pendingRemoval?.memberEmail}) will immediately lose access to this team.
              </p>
            </div>

            <div className="rounded-md border border-status-error/30 bg-status-error/5 px-3 py-2 text-xs text-status-error">
              This action cannot be undone.
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => setPendingRemoval(null)}
                disabled={removeMember.isPending}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                icon="fa-solid fa-user-minus"
                onClick={() => void handleRemoveMember()}
                isLoading={removeMember.isPending}
                className="w-full sm:w-auto"
              >
                Remove member
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  )
}
