import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ActivePublicDocumentShare } from 'shared/document-share'
import { useParams } from 'react-router-dom'
import { resolvePublicDocumentShare } from '@/api/publicDocumentShares'
import kanwasLogo from '@/assets/kanwas-logo-web.png'
import { PublicDocumentNoteSurface } from '@/components/public-note/PublicDocumentNoteSurface'
import { usePublicNoteBlockNoteBinding } from '@/hooks/usePublicNoteBlockNoteBinding'
import { buildAppPath } from '@/lib/appPaths'
import { describeConnectionLoss } from '@/lib/liveConnection'
import { PublicNoteProvider, usePublicNote } from '@/providers/public-note'
import { useTheme } from '@/providers/theme'

const TOPBAR_ACTION_CLASS_NAME =
  'inline-flex h-[40px] items-center justify-center gap-2 rounded-[18px] border px-[18px] py-[8px] text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-[1px] hover:brightness-[1.04] focus:outline-none focus:ring-2 focus:ring-focused-content focus:ring-offset-2 dark:text-[#1d1d1d]'

const TOPBAR_ACTION_STYLE: CSSProperties = {
  backgroundImage: 'var(--primary-button-gradient)',
  borderColor: 'var(--primary-button-border)',
  boxShadow: 'var(--primary-button-shadow), inset 0 0 6px rgba(255,255,255,0.35)',
}

function KanwasTopBar({ openHref, title, meta }: { openHref?: string; title?: string; meta?: ReactNode }) {
  return (
    <header className="bg-white text-[#1d1d1d] transition-colors dark:bg-editor dark:text-foreground">
      <div className="mx-auto flex min-h-[84px] w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 border-b border-[#e7e2d9] px-4 py-4 transition-colors sm:px-6 xl:px-0 dark:border-white/8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <a href="/" aria-label="Kanwas home" className="inline-flex min-h-[44px] items-center md:min-h-0">
            <img src={kanwasLogo} alt="Kanwas" className="h-8 w-auto shrink-0 transition-[filter] sm:h-9 dark:invert" />
          </a>

          {title ? (
            <>
              <div className="hidden h-8 w-px bg-[#e6e0d6] transition-colors sm:block dark:bg-white/8" />
              <h1
                className="min-w-0 truncate text-[18px] font-medium tracking-[-0.02em] text-[#1d1d1d] transition-colors sm:text-[20px] dark:text-foreground"
                title={title}
              >
                {title}
              </h1>
            </>
          ) : null}
        </div>

        {meta || openHref ? (
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
            {meta ? <div className="flex flex-wrap items-center justify-end gap-2">{meta}</div> : null}

            {openHref ? (
              <a href={openHref} className={TOPBAR_ACTION_CLASS_NAME} style={TOPBAR_ACTION_STYLE}>
                <span>Open in Kanwas</span>
                <i className="fa-solid fa-arrow-up-right-from-square text-[12px]" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  )
}

function PageShell({
  children,
  openHref,
  headerTitle,
  headerMeta,
}: {
  children: ReactNode
  openHref?: string
  headerTitle?: string
  headerMeta?: ReactNode
}) {
  const { themeMode } = useTheme()

  useEffect(() => {
    const previousHtmlBackgroundColor = document.documentElement.style.backgroundColor
    const previousBodyBackgroundColor = document.body.style.backgroundColor
    const pageBackgroundColor = themeMode === 'dark' ? 'var(--editor)' : '#ffffff'

    document.documentElement.style.backgroundColor = pageBackgroundColor
    document.body.style.backgroundColor = pageBackgroundColor

    return () => {
      document.documentElement.style.backgroundColor = previousHtmlBackgroundColor
      document.body.style.backgroundColor = previousBodyBackgroundColor
    }
  }, [themeMode])

  return (
    <main
      className="flex h-full flex-col overflow-y-auto overflow-x-hidden bg-white text-foreground transition-colors dark:bg-editor"
      style={{ colorScheme: themeMode }}
    >
      <KanwasTopBar openHref={openHref} title={headerTitle} meta={headerMeta} />
      <div className="mx-auto flex min-h-[calc(100vh-84px)] w-full max-w-[1200px] flex-col px-4 py-6 sm:px-6 sm:py-8 xl:px-0">
        <div className="flex flex-1 justify-center">{children}</div>
      </div>
    </main>
  )
}

function StateCard({
  badge,
  title,
  description,
  detail,
  openHref,
}: {
  badge: { icon: string; label: string; tone?: 'error' | 'accent' | 'neutral' }
  title: string
  description: string
  detail?: string | null
  openHref?: string
}) {
  const badgeClasses =
    badge.tone === 'error'
      ? 'border-status-error/15 bg-status-error/5 text-status-error'
      : badge.tone === 'accent'
        ? 'border-focused-content/20 bg-focused/60 text-focused-content'
        : 'border-outline/70 bg-canvas/80 text-foreground-muted'

  return (
    <PageShell openHref={openHref}>
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-2xl items-center justify-center">
        <div className="w-full px-4 py-10 text-center sm:px-8 sm:py-12">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${badgeClasses}`}
          >
            <i className={`fa-solid ${badge.icon}`} aria-hidden="true" />
            <span>{badge.label}</span>
          </div>

          <h1 className="mt-5 text-2xl font-medium tracking-tight text-foreground sm:text-[28px]">{title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-foreground-muted">{description}</p>
          {detail ? <p className="mt-4 text-xs leading-6 text-foreground-muted">{detail}</p> : null}
        </div>
      </div>
    </PageShell>
  )
}

function MetaChip({
  icon,
  label,
  accent = false,
  swatch,
}: {
  icon?: string
  label: string
  accent?: boolean
  swatch?: string
}) {
  return (
    <span
      className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium tracking-[-0.01em] transition-colors ${
        accent
          ? 'border-[#e6cc97] bg-[#fff9eb] text-[#b36f00] dark:border-[#775f26] dark:bg-[#39362e] dark:text-[#ffd268]'
          : 'border-[#e4ddd3] bg-white text-[#766b5f] dark:border-outline dark:bg-[#222222] dark:text-foreground-muted'
      }`}
    >
      {swatch ? (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: swatch }} />
      ) : (
        <i className={`fa-solid ${icon} text-[10px]`} aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  )
}

function ActivePublicDocumentShareView({
  share,
  openHref,
  noteSurface,
}: {
  share: ActivePublicDocumentShare
  openHref: string
  noteSurface: ReactNode
}) {
  const { disconnectReason, isConnected, isReconnecting } = usePublicNote()
  const connectionState = isConnected
    ? { label: 'Live', accent: true, icon: undefined, swatch: '#d48900' }
    : isReconnecting
      ? { label: 'Reconnecting', accent: false, icon: 'fa-arrows-rotate fa-spin', swatch: undefined }
      : { label: 'Disconnected', accent: false, icon: 'fa-plug-circle-xmark', swatch: undefined }
  const disconnectDetail = describeConnectionLoss(disconnectReason)
  const disconnectedCopy =
    share.accessMode === 'editable'
      ? "Disconnected. New edits won't sync until the shared note reconnects."
      : 'Disconnected. Live updates will resume once the shared note reconnects.'

  return (
    <PageShell
      openHref={openHref}
      headerTitle={share.name}
      headerMeta={
        <>
          <MetaChip
            icon={share.accessMode === 'editable' ? 'fa-pen-to-square' : 'fa-eye'}
            label={share.accessMode === 'editable' ? 'Can edit' : 'Read only'}
            accent={share.accessMode === 'editable'}
          />
          <MetaChip
            icon={connectionState.icon}
            label={connectionState.label}
            accent={connectionState.accent}
            swatch={connectionState.swatch}
          />
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-[840px] flex-col gap-3">
        {!isConnected && !isReconnecting ? (
          <div className="flex flex-col gap-3 rounded-[24px] border border-status-error/15 bg-status-error/5 px-4 py-4 text-sm text-status-error sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p>{disconnectedCopy}</p>
              {disconnectDetail ? <p className="text-xs text-foreground-muted">{disconnectDetail}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-[38px] items-center justify-center rounded-full border border-current px-4 text-sm font-semibold"
            >
              Reload
            </button>
          </div>
        ) : null}
        {noteSurface}
      </div>
    </PageShell>
  )
}

function ActivePublicDocumentShareContent({ share }: { share: ActivePublicDocumentShare }) {
  const { hasInitiallySynced, initialSyncError } = usePublicNote()
  const { fragment, editorKey, collaborationProvider, undoManager } = usePublicNoteBlockNoteBinding()
  const openHref = buildAppPath(share.workspaceRedirectPath)
  const unavailableReason = useMemo(() => {
    if (initialSyncError) {
      return initialSyncError
    }

    return 'The source note may have been removed or the share may have changed since this page was opened.'
  }, [initialSyncError])

  if (!hasInitiallySynced && initialSyncError) {
    return (
      <StateCard
        badge={{ icon: 'fa-link-slash', label: 'Unavailable', tone: 'error' }}
        title="This shared note can't be loaded"
        description="The link opened, but the live document is not available for a fresh connection."
        detail={initialSyncError}
        openHref={openHref}
      />
    )
  }

  if (!hasInitiallySynced) {
    return (
      <StateCard
        badge={{ icon: 'fa-spinner fa-spin', label: 'Loading', tone: 'accent' }}
        title="Opening the shared note"
        description="Resolving the public link and preparing the standalone note surface."
      />
    )
  }

  if (!fragment || !undoManager) {
    return (
      <StateCard
        badge={{ icon: 'fa-triangle-exclamation', label: 'Unavailable', tone: 'error' }}
        title="This shared note is unavailable"
        description="Kanwas couldn't mount the shared BlockNote document for this link."
        detail={unavailableReason}
        openHref={openHref}
      />
    )
  }

  return (
    <ActivePublicDocumentShareView
      share={share}
      openHref={openHref}
      noteSurface={
        <PublicDocumentNoteSurface
          share={share}
          fragment={fragment}
          editorKey={editorKey}
          collaborationProvider={collaborationProvider}
          undoManager={undoManager}
        />
      }
    />
  )
}

export function PublicDocumentSharePage() {
  const { longHashId } = useParams<{ longHashId: string }>()
  const shareQuery = useQuery({
    queryKey: ['public-document-share', longHashId],
    enabled: Boolean(longHashId),
    queryFn: () => resolvePublicDocumentShare(longHashId!),
    retry: false,
    staleTime: 0,
    gcTime: 60_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  if (!longHashId) {
    return (
      <StateCard
        badge={{ icon: 'fa-circle-question', label: 'Missing link', tone: 'error' }}
        title="This shared note link is incomplete"
        description="The page URL is missing the long share hash needed to resolve a public document."
      />
    )
  }

  if (shareQuery.isLoading) {
    return (
      <StateCard
        badge={{ icon: 'fa-spinner fa-spin', label: 'Loading', tone: 'accent' }}
        title="Opening the shared note"
        description="Resolving the public link and preparing the standalone note surface."
      />
    )
  }

  if (shareQuery.isError || !shareQuery.data) {
    return (
      <StateCard
        badge={{ icon: 'fa-triangle-exclamation', label: 'Unavailable', tone: 'error' }}
        title="We couldn't load this shared note"
        description="The public share service didn't return a valid note payload for this link."
        detail={shareQuery.error instanceof Error ? shareQuery.error.message : null}
      />
    )
  }

  if (shareQuery.data.status === 'not_found') {
    return (
      <StateCard
        badge={{ icon: 'fa-link-slash', label: 'Not found', tone: 'error' }}
        title="This shared note does not exist"
        description="The link was not recognized, or it has already been rotated away from this public URL."
      />
    )
  }

  if (shareQuery.data.status === 'revoked') {
    return (
      <StateCard
        badge={{ icon: 'fa-lock', label: 'Revoked', tone: 'error' }}
        title="This shared link has been turned off"
        description="The owner disabled public access for this note. If you still need it, ask them for a freshly generated link."
        openHref={buildAppPath(shareQuery.data.workspaceRedirectPath)}
      />
    )
  }

  return (
    <PublicNoteProvider
      workspaceId={shareQuery.data.workspaceId}
      noteId={shareQuery.data.noteId}
      longHashId={shareQuery.data.longHashId}
    >
      <ActivePublicDocumentShareContent share={shareQuery.data} />
    </PublicNoteProvider>
  )
}
