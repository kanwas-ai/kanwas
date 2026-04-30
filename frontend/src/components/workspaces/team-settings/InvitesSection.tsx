import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useCreateOrganizationInvite, useOrganizationInvites, useRevokeOrganizationInvite } from '@/hooks/useInvites'
import { buildInviteUrl } from '@/lib/inviteLinks'
import { showToast } from '@/utils/toast'

interface InvitesSectionProps {
  workspaceId?: string
  isAdmin: boolean
  isOpen: boolean
}

function isInviteActive(invite: { revokedAt: unknown; consumedAt: unknown; expiresAt: unknown }): boolean {
  if (invite.revokedAt || invite.consumedAt) return false
  const expiresAt = new Date(String(invite.expiresAt))
  if (Number.isNaN(expiresAt.getTime())) return false
  return expiresAt.getTime() > Date.now()
}

function formatInviteLifetime(value: unknown): string {
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return 'Expiration unavailable'
  const diffMs = date.getTime() - Date.now()
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (daysRemaining <= 1) return 'Expires within 24 hours'
  return `Expires in ${daysRemaining} days`
}

function formatInviteDate(value: unknown): string {
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function InvitesSection({ workspaceId, isAdmin, isOpen }: InvitesSectionProps) {
  const {
    data: invites = [],
    isLoading: isInvitesLoading,
    isError: isInvitesError,
    error: invitesError,
    refetch: refetchInvites,
  } = useOrganizationInvites(workspaceId, { enabled: isOpen && isAdmin })

  const createInvite = useCreateOrganizationInvite(workspaceId)
  const revokeInvite = useRevokeOrganizationInvite(workspaceId)

  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null)
  const [hasCopiedInvite, setHasCopiedInvite] = useState(false)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const copyResetTimeoutRef = useRef<number | null>(null)
  const [inviteUrlMap, setInviteUrlMap] = useState<Map<string, string>>(new Map())
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)
  const copyRowResetTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setCreatedInviteUrl(null)
      setHasCopiedInvite(false)
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
      if (copyRowResetTimeoutRef.current !== null) {
        window.clearTimeout(copyRowResetTimeoutRef.current)
      }
    }
  }, [])

  const activeInvites = useMemo(() => invites.filter(isInviteActive), [invites])

  const handleCreateInvite = async () => {
    try {
      const createdInvite = await createInvite.mutateAsync({ roleToGrant: 'member' })
      const inviteUrl = buildInviteUrl(createdInvite.token, window.location.origin, import.meta.env.BASE_URL)
      setCreatedInviteUrl(inviteUrl)
      setHasCopiedInvite(false)
      setInviteUrlMap((prev) => new Map(prev).set(createdInvite.invite.id, inviteUrl))
      void refetchInvites()
    } catch {
      // Mutation hook displays a toast.
    }
  }

  const handleCopyInvite = async () => {
    if (!createdInviteUrl) return
    try {
      if (!navigator.clipboard) throw new Error('Clipboard is not available')
      await navigator.clipboard.writeText(createdInviteUrl)
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
      setHasCopiedInvite(true)
      copyResetTimeoutRef.current = window.setTimeout(() => setHasCopiedInvite(false), 1800)
    } catch {
      showToast('Failed to copy invite link', 'error')
    }
  }

  const handleCopyInviteRow = async (inviteId: string) => {
    const url = inviteUrlMap.get(inviteId)
    if (!url) return
    try {
      if (!navigator.clipboard) throw new Error('Clipboard is not available')
      await navigator.clipboard.writeText(url)
      if (copyRowResetTimeoutRef.current !== null) {
        window.clearTimeout(copyRowResetTimeoutRef.current)
      }
      setCopiedInviteId(inviteId)
      copyRowResetTimeoutRef.current = window.setTimeout(() => setCopiedInviteId(null), 1800)
    } catch {
      showToast('Failed to copy invite link', 'error')
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    setRevokingInviteId(inviteId)
    try {
      await revokeInvite.mutateAsync(inviteId)
    } catch {
      // Mutation hook displays a toast.
    } finally {
      setRevokingInviteId((current) => (current === inviteId ? null : current))
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-outline bg-editor/60 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-muted">Invites</p>
          <h3 className="text-sm font-semibold text-foreground">Invite links</h3>
          <p className="text-xs text-foreground-muted">Generate one-time invite links to add teammates.</p>
        </div>

        {isAdmin && (
          <Button
            variant="inverted"
            icon="fa-solid fa-link"
            onClick={() => void handleCreateInvite()}
            isLoading={createInvite.isPending}
            className="w-full sm:w-auto"
          >
            {createdInviteUrl ? 'Create another link' : 'Create invite link'}
          </Button>
        )}
      </div>

      {createdInviteUrl && (
        <div className="space-y-3 rounded-lg border border-focused-content/25 bg-focused/40 p-3">
          <div className="text-[11px] font-medium text-foreground-muted">Latest generated invite link</div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              readOnly
              value={createdInviteUrl}
              className="flex-1 rounded-md border border-outline bg-canvas px-3 py-2 font-mono text-xs text-foreground"
            />
            <Button
              variant="secondary"
              icon={hasCopiedInvite ? 'fa-solid fa-check' : 'fa-solid fa-copy'}
              onClick={() => void handleCopyInvite()}
              className="w-full sm:w-auto"
            >
              {hasCopiedInvite ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-foreground-muted">Active invite links</p>
            <span className="inline-flex min-w-6 items-center justify-center rounded-full border border-outline bg-canvas px-2 py-0.5 text-[11px] font-medium text-foreground-muted">
              {activeInvites.length}
            </span>
          </div>

          {isInvitesLoading ? (
            <div className="space-y-2">
              <div className="h-16 rounded-md bg-block-highlight animate-pulse" />
            </div>
          ) : isInvitesError ? (
            <div className="space-y-2 rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-xs text-status-error">
              <p>{invitesError instanceof Error ? invitesError.message : 'Unable to load invite links.'}</p>
              <Button size="sm" variant="secondary" onClick={() => void refetchInvites()}>
                Retry
              </Button>
            </div>
          ) : activeInvites.length > 0 ? (
            <div className="space-y-2">
              {activeInvites.map((invite) => (
                <div key={invite.id} className="rounded-lg border border-outline bg-canvas px-3 py-3 sm:px-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <span className="truncate text-sm font-medium text-foreground">{invite.inviteeName}</span>
                      <p className="text-xs text-foreground-muted">
                        {formatInviteLifetime(invite.expiresAt)} - {formatInviteDate(invite.expiresAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:pl-3">
                      {inviteUrlMap.has(invite.id) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={copiedInviteId === invite.id ? 'fa-solid fa-check' : 'fa-solid fa-copy'}
                          onClick={() => void handleCopyInviteRow(invite.id)}
                          className="w-full sm:w-auto"
                        >
                          {copiedInviteId === invite.id ? 'Copied' : 'Copy'}
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        icon="fa-solid fa-ban"
                        onClick={() => void handleRevokeInvite(invite.id)}
                        isLoading={revokeInvite.isPending && revokingInviteId === invite.id}
                        disabled={revokeInvite.isPending && revokingInviteId !== invite.id}
                        className="w-full sm:w-auto"
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-outline bg-canvas px-3 py-4 text-center text-xs text-foreground-muted">
              No active invite links yet. Create one to invite teammates.
            </div>
          )}
        </div>
      )}

      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-outline bg-canvas px-3 py-3 text-xs text-foreground-muted">
          <i className="fa-solid fa-lock mt-0.5" />
          <p>Only team admins can manage invite links and remove members.</p>
        </div>
      )}
    </section>
  )
}
