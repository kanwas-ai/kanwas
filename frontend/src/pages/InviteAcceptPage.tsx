import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthState } from '@/providers/auth'
import { useAcceptOrganizationInvite, useOrganizationInvitePreview } from '@/hooks/useInvites'
import { clearPendingInviteToken, isInvalidInviteTokenMessage, setPendingInviteToken } from '@/lib/pendingInvite'
import { toUrlUuid } from '@/utils/uuid'

interface InviteMetaItem {
  label: string
  value: string
}

interface InviteCardProps {
  icon: string
  iconTone?: 'neutral' | 'error'
  title: string
  description: string
  metaItems?: InviteMetaItem[]
  statusText?: string
  children?: React.ReactNode
}

interface InvitePageShellProps {
  children: React.ReactNode
}

function formatInviteDate(value: unknown): string | null {
  if (!value) return null

  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRoleLabel(value: unknown): string | null {
  if (value === 'admin') return 'Admin'
  if (value === 'member') return 'Member'
  return null
}

function getInviteeName(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === 'invited member') return null

  return trimmed
}

function InvitePageShell({ children }: InvitePageShellProps) {
  const base = import.meta.env.BASE_URL
  const posterSrc = `${base}background-login-poster.jpg`
  const videoSrc = `${base}background-login.webm`

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center px-4 py-6 font-['Inter',system-ui,sans-serif] overflow-hidden"
      style={{
        backgroundImage: `url(${posterSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        poster={posterSrc}
        className="absolute inset-0 h-full w-full object-cover"
        src={videoSrc}
      />

      <div className="relative z-10 w-full max-w-[440px]">{children}</div>
    </div>
  )
}

function InviteCard({
  icon,
  iconTone = 'neutral',
  title,
  description,
  metaItems = [],
  statusText,
  children,
}: InviteCardProps) {
  const iconToneClass =
    iconTone === 'error'
      ? 'border-status-error/25 bg-status-error/10 text-status-error'
      : 'border-focused-content/25 bg-focused/60 text-focused-content'

  return (
    <div
      className="w-full rounded-[20px] border-2 border-[#dcd2bf] bg-canvas px-8 py-9"
      style={{ boxShadow: '0 18px 64px rgb(86 75 44 / 60%)' }}
    >
      <div className="mb-7 flex flex-col items-center gap-2 text-center">
        <div className={`mb-1 flex h-9 w-9 items-center justify-center rounded-[10px] border ${iconToneClass}`}>
          <i className={`${icon} text-sm`} />
        </div>
        <p className="text-[11px] uppercase tracking-[0.08em] text-foreground-muted">Team invite</p>
        <h1 className="text-[22px] font-semibold text-foreground tracking-[-0.01em]">{title}</h1>
        <p className="text-[13px] text-foreground-muted leading-snug">{description}</p>
      </div>

      {metaItems.length > 0 && (
        <dl className="mb-5 divide-y divide-[#dcd2bf] rounded-[12px] border border-[#dcd2bf] bg-focused/30 px-3.5 py-1">
          {metaItems.map((item) => (
            <div key={item.label} className="grid grid-cols-[76px_minmax(0,1fr)] items-start gap-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-[0.08em] text-foreground-muted">{item.label}</dt>
              <dd className="min-w-0 break-words text-right text-[13px] font-medium leading-snug text-foreground">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {statusText && metaItems.length === 0 && (
        <div className="mb-5 rounded-[10px] border border-[#dcd2bf] bg-canvas px-3 py-2 text-center text-[12px] text-foreground-muted">
          {statusText}
        </div>
      )}

      {children && <div>{children}</div>}
    </div>
  )
}

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useAuthState()
  const acceptInvite = useAcceptOrganizationInvite()
  const invitePreview = useOrganizationInvitePreview(token)
  const hasAttemptedAcceptanceRef = useRef(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const organizationName = invitePreview.data?.organizationName
  const invitePreviewErrorMessage = invitePreview.error instanceof Error ? invitePreview.error.message : null
  const inviteeName = getInviteeName(invitePreview.data?.inviteeName)
  const roleLabel = formatRoleLabel(invitePreview.data?.roleToGrant)
  const expiresLabel = formatInviteDate(invitePreview.data?.expiresAt)
  const previewMetaItems: InviteMetaItem[] = [
    ...(organizationName ? [{ label: 'Team', value: organizationName }] : []),
    ...(inviteeName ? [{ label: 'For', value: inviteeName }] : []),
    ...(roleLabel ? [{ label: 'Role', value: roleLabel }] : []),
    ...(expiresLabel ? [{ label: 'Expires', value: expiresLabel }] : []),
  ]

  useEffect(() => {
    hasAttemptedAcceptanceRef.current = false
    setAcceptError(null)

    if (!token) {
      return
    }

    setPendingInviteToken(token)
  }, [token])

  useEffect(() => {
    if (!token || !isAuthenticated || hasAttemptedAcceptanceRef.current) {
      return
    }

    hasAttemptedAcceptanceRef.current = true

    const accept = async () => {
      try {
        const result = await acceptInvite.mutateAsync(token)
        clearPendingInviteToken()
        navigate(`/w/${toUrlUuid(result.workspaceId)}`, { replace: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to accept invite'
        if (isInvalidInviteTokenMessage(message)) {
          clearPendingInviteToken()
        }
        setAcceptError(message)
      }
    }

    void accept()
  }, [acceptInvite, isAuthenticated, navigate, token])

  useEffect(() => {
    if (invitePreviewErrorMessage && isInvalidInviteTokenMessage(invitePreviewErrorMessage)) {
      clearPendingInviteToken()
    }
  }, [invitePreviewErrorMessage])

  if (!token) {
    return (
      <InvitePageShell>
        <InviteCard
          icon="fa-solid fa-triangle-exclamation"
          iconTone="error"
          title="Invalid invite link"
          description="This invite link is missing a token."
        >
          <Link
            to="/"
            className="w-full flex items-center justify-center rounded-[10px] bg-[var(--palette-cool-gray)] py-2.5 text-sm font-medium text-foreground transition-opacity hover:opacity-80"
          >
            Go to workspace
          </Link>
        </InviteCard>
      </InvitePageShell>
    )
  }

  if (isLoading) {
    return (
      <InvitePageShell>
        <InviteCard
          icon="fa-solid fa-spinner fa-spin"
          title="Checking your session"
          description={`Please wait while we verify your account before accepting${organizationName ? ` your invite to ${organizationName}` : ' the invite'}.`}
          metaItems={previewMetaItems}
          statusText={invitePreview.isLoading ? 'Checking invite details...' : undefined}
        />
      </InvitePageShell>
    )
  }

  if (!isAuthenticated && invitePreviewErrorMessage && isInvalidInviteTokenMessage(invitePreviewErrorMessage)) {
    return (
      <InvitePageShell>
        <InviteCard
          icon="fa-solid fa-triangle-exclamation"
          iconTone="error"
          title="Invalid invite link"
          description={invitePreviewErrorMessage}
        >
          <Link
            to="/"
            className="w-full flex items-center justify-center rounded-[10px] bg-[var(--palette-cool-gray)] py-2.5 text-sm font-medium text-foreground transition-opacity hover:opacity-80"
          >
            Go to workspace
          </Link>
        </InviteCard>
      </InvitePageShell>
    )
  }

  if (!isAuthenticated) {
    const inviteTitle = organizationName ? 'Join this team on Kanwas' : 'You were invited to join a team'

    return (
      <InvitePageShell>
        <InviteCard
          icon="fa-solid fa-envelope-open-text"
          title={inviteTitle}
          description="Create an account or sign in to accept this invite."
          metaItems={previewMetaItems}
          statusText={invitePreview.isLoading ? 'Checking invite details...' : undefined}
        >
          <div className="space-y-2.5">
            <Link
              to="/register"
              className="w-full flex items-center justify-center rounded-[10px] py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(180deg, #5a5a5a 0%, #2e2e2e 100%)', border: '1px solid #525252' }}
            >
              Create account
            </Link>
            <Link
              to="/login"
              className="w-full flex items-center justify-center rounded-[10px] bg-[var(--palette-cool-gray)] py-2.5 text-sm font-medium text-foreground transition-opacity hover:opacity-80"
            >
              Sign in
            </Link>
          </div>
        </InviteCard>
      </InvitePageShell>
    )
  }

  if (acceptError) {
    return (
      <InvitePageShell>
        <InviteCard
          icon="fa-solid fa-circle-xmark"
          iconTone="error"
          title="Unable to accept invite"
          description={acceptError}
          metaItems={previewMetaItems}
        >
          <Link
            to="/"
            className="w-full flex items-center justify-center rounded-[10px] bg-[var(--palette-cool-gray)] py-2.5 text-sm font-medium text-foreground transition-opacity hover:opacity-80"
          >
            Go to workspace
          </Link>
        </InviteCard>
      </InvitePageShell>
    )
  }

  return (
    <InvitePageShell>
      <InviteCard
        icon="fa-solid fa-spinner fa-spin"
        title="Joining team"
        description={
          organizationName
            ? `Accepting your invite to ${organizationName} and preparing your workspace...`
            : 'Accepting your invite and preparing your workspace...'
        }
        metaItems={previewMetaItems}
        statusText={invitePreview.isLoading ? 'Checking invite details...' : undefined}
      />
    </InvitePageShell>
  )
}
