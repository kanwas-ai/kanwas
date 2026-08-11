import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal, ModalContent } from '@/components/ui/Modal'
import {
  useCreateDocumentShare,
  useDisableDocumentShare,
  useDocumentShare,
  useUpdateDocumentShare,
  useWorkspaceDocumentShares,
} from '@/hooks/useDocumentShares'
import { buildAbsoluteAppUrl, buildAppPath } from '@/lib/appPaths'
import { showToast } from '@/utils/toast'
import type { DocumentShareAccessMode, DocumentShareOwnerState } from 'shared/document-share'

interface DocumentShareControlProps {
  workspaceId: string
  noteId: string
  documentName: string
}

const ACCESS_MODE_OPTIONS: Array<{ value: DocumentShareAccessMode; label: string }> = [
  { value: 'editable', label: 'Can edit' },
  { value: 'readonly', label: 'Can view' },
]

const FIELD_CLASS_NAME =
  'w-full rounded-md border border-outline bg-editor px-3 py-2 text-sm text-foreground outline-none transition focus:ring-1 focus:ring-focused-content disabled:cursor-not-allowed disabled:opacity-60'

const SECONDARY_SURFACE_CLASS_NAME = 'bg-editor hover:bg-block-highlight'

function getDefaultShareName(documentName: string): string {
  const trimmed = documentName.trim()
  return trimmed.length > 0 ? trimmed : 'Untitled Document'
}

function normalizeShareName(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function buildPublicShareUrl(publicPath: string): string {
  if (typeof window === 'undefined') {
    return buildAppPath(publicPath)
  }

  return buildAbsoluteAppUrl(publicPath, window.location.origin)
}

function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value)
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    return Promise.reject(new Error('Copy failed'))
  }

  return Promise.resolve()
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof Error)) {
    return fallbackMessage
  }

  const message = error.message.trim()
  if (!message || /^Request failed with status code \d+/.test(message)) {
    return fallbackMessage
  }

  return message
}

function applyOwnerStateToDraft(
  ownerState: DocumentShareOwnerState,
  setDraftName: (name: string) => void,
  setDraftAccessMode: (accessMode: DocumentShareAccessMode) => void
) {
  if (!ownerState.share) {
    return
  }

  setDraftName(ownerState.share.name)
  setDraftAccessMode(ownerState.share.accessMode)
}

export function DocumentShareControl({ workspaceId, noteId, documentName }: DocumentShareControlProps) {
  const workspaceSharesQuery = useWorkspaceDocumentShares(workspaceId)
  const [isOpen, setIsOpen] = useState(false)
  const shareQuery = useDocumentShare(workspaceId, noteId, { enabled: isOpen })
  const createShareMutation = useCreateDocumentShare(workspaceId, noteId)
  const updateShareMutation = useUpdateDocumentShare(workspaceId, noteId)
  const disableShareMutation = useDisableDocumentShare(workspaceId, noteId)

  const [draftName, setDraftName] = useState(getDefaultShareName(documentName))
  const [draftAccessMode, setDraftAccessMode] = useState<DocumentShareAccessMode>('editable')
  const [modalError, setModalError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [copyButtonWidths, setCopyButtonWidths] = useState<{ idle: number; copied: number } | null>(null)
  const autoCreateAttemptedRef = useRef(false)
  const copyIdleMeasureRef = useRef<HTMLSpanElement | null>(null)
  const copyCopiedMeasureRef = useRef<HTMLSpanElement | null>(null)

  const workspaceShare = useMemo(
    () => workspaceSharesQuery.data?.shares.find((share) => share.noteId === noteId) ?? null,
    [noteId, workspaceSharesQuery.data?.shares]
  )
  const activeShare = shareQuery.data ? (shareQuery.data.active ? shareQuery.data.share : null) : workspaceShare
  const defaultShareName = useMemo(() => getDefaultShareName(documentName), [documentName])
  const shareUrl = activeShare ? buildPublicShareUrl(activeShare.publicPath) : ''
  const isShared = activeShare !== null
  const isSaving = createShareMutation.isPending || updateShareMutation.isPending
  const isDisabling = disableShareMutation.isPending
  const isBusy = isSaving || isDisabling
  const isTriggerLoading = workspaceSharesQuery.isLoading && !workspaceSharesQuery.data

  useEffect(() => {
    if (copyState !== 'copied') {
      return
    }

    const timeoutId = window.setTimeout(() => setCopyState('idle'), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [copyState])

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }

    const updateCopyButtonWidths = () => {
      const idleWidth = Math.ceil(copyIdleMeasureRef.current?.getBoundingClientRect().width ?? 0)
      const copiedWidth = Math.ceil(copyCopiedMeasureRef.current?.getBoundingClientRect().width ?? 0)

      if (!idleWidth || !copiedWidth) {
        return
      }

      setCopyButtonWidths((current) => {
        if (current?.idle === idleWidth && current?.copied === copiedWidth) {
          return current
        }

        return {
          idle: idleWidth,
          copied: copiedWidth,
        }
      })
    }

    updateCopyButtonWidths()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => updateCopyButtonWidths())

    if (copyIdleMeasureRef.current) {
      observer.observe(copyIdleMeasureRef.current)
    }

    if (copyCopiedMeasureRef.current) {
      observer.observe(copyCopiedMeasureRef.current)
    }

    return () => observer.disconnect()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      autoCreateAttemptedRef.current = false
      return
    }

    setDraftName(activeShare?.name ?? defaultShareName)
    setDraftAccessMode(activeShare?.accessMode ?? 'editable')
  }, [activeShare?.accessMode, activeShare?.name, defaultShareName, isOpen])

  useEffect(() => {
    if (!isOpen || shareQuery.isLoading || shareQuery.isError || !shareQuery.data || shareQuery.data.active) {
      return
    }

    if (autoCreateAttemptedRef.current) {
      return
    }

    autoCreateAttemptedRef.current = true
    setModalError(null)

    void createShareMutation
      .mutateAsync({
        name: defaultShareName,
        accessMode: 'editable',
      })
      .then((ownerState) => {
        applyOwnerStateToDraft(ownerState, setDraftName, setDraftAccessMode)
      })
      .catch((error) => {
        setModalError(getErrorMessage(error, 'Failed to create share link'))
      })
  }, [createShareMutation, defaultShareName, isOpen, shareQuery.data, shareQuery.isError, shareQuery.isLoading])

  const visibleError =
    modalError ??
    (shareQuery.isError && !shareQuery.data ? getErrorMessage(shareQuery.error, 'Failed to load share settings') : null)
  const hasLoadError = shareQuery.isError && !shareQuery.data
  const isInitializingShare =
    isOpen &&
    !visibleError &&
    ((!shareQuery.data && shareQuery.isLoading) || (!!shareQuery.data && !shareQuery.data.active && !activeShare))

  const statusText = isInitializingShare
    ? 'Loading share settings'
    : activeShare
      ? draftAccessMode === 'editable'
        ? 'Anyone with the link can edit'
        : 'Anyone with the link can view'
      : 'Share is off'

  const copyButtonWidth = copyButtonWidths ? copyButtonWidths[copyState] : null
  const copyButtonContainerStyle: CSSProperties | undefined = copyButtonWidth
    ? ({ '--document-share-copy-width': `${copyButtonWidth}px` } as CSSProperties)
    : undefined

  const handleClose = () => {
    setIsOpen(false)
    setModalError(null)
    setCopyState('idle')
  }

  const handleOpen = () => {
    setDraftName(activeShare?.name ?? defaultShareName)
    setDraftAccessMode(activeShare?.accessMode ?? 'editable')
    setModalError(null)
    setCopyState('idle')
    setIsOpen(true)
  }

  const saveShare = async (
    name: string,
    accessMode: DocumentShareAccessMode,
    options: { forceCreate?: boolean } = {}
  ) => {
    const nextName = normalizeShareName(name, defaultShareName)
    const shouldCreate = options.forceCreate || !activeShare

    setModalError(null)

    try {
      const ownerState = shouldCreate
        ? await createShareMutation.mutateAsync({ name: nextName, accessMode })
        : await updateShareMutation.mutateAsync({ name: nextName, accessMode })

      applyOwnerStateToDraft(ownerState, setDraftName, setDraftAccessMode)
      return ownerState.share
    } catch (error) {
      setModalError(
        getErrorMessage(error, shouldCreate ? 'Failed to create share link' : 'Failed to update share settings')
      )
      return null
    }
  }

  const handleRetry = async () => {
    if (shareQuery.isError && !shareQuery.data) {
      setModalError(null)
      await shareQuery.refetch()
      return
    }

    await saveShare(defaultShareName, 'editable', { forceCreate: true })
  }

  const handleNameCommit = async () => {
    const nextName = normalizeShareName(draftName, defaultShareName)

    if (nextName !== draftName) {
      setDraftName(nextName)
    }

    if (!activeShare || activeShare.name === nextName) {
      return
    }

    const previousName = activeShare.name
    const nextShare = await saveShare(nextName, draftAccessMode)

    if (!nextShare) {
      setDraftName(previousName)
    }
  }

  const handleAccessModeChange = async (nextAccessMode: DocumentShareAccessMode) => {
    const previousAccessMode = activeShare?.accessMode ?? draftAccessMode
    setDraftAccessMode(nextAccessMode)

    if (!activeShare) {
      return
    }

    const nextShare = await saveShare(draftName, nextAccessMode)

    if (!nextShare) {
      setDraftAccessMode(previousAccessMode)
    }
  }

  const handleDisable = async () => {
    setModalError(null)

    try {
      await disableShareMutation.mutateAsync()
      showToast('Sharing turned off. Open Share again to make a fresh link.', 'success')
      handleClose()
    } catch (error) {
      setModalError(getErrorMessage(error, 'Failed to disable sharing'))
    }
  }

  const handleCopy = async () => {
    if (!shareUrl) {
      return
    }

    setModalError(null)

    try {
      await copyTextToClipboard(shareUrl)
      setCopyState('copied')
    } catch (error) {
      setModalError(getErrorMessage(error, 'Failed to copy link'))
    }
  }

  return (
    <>
      <button
        type="button"
        className={`nodrag nopan -ml-1 inline-flex !cursor-pointer !select-none items-center gap-1 px-0 py-0.5 text-[12px] font-medium transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none ${
          isShared ? 'text-status-success opacity-90' : 'text-foreground opacity-55'
        }`}
        onClick={handleOpen}
        aria-label={activeShare ? 'Manage share link' : 'Share note'}
      >
        {isTriggerLoading ? (
          <i className="fa-solid fa-spinner fa-spin text-[11px]" />
        ) : (
          <i className="fa-solid fa-link text-[11px]" />
        )}
        <span>{isShared ? 'Shared' : 'Share'}</span>
      </button>

      <Modal isOpen={isOpen} onClose={handleClose}>
        <div className="w-[92vw] max-w-[34rem]">
          <ModalContent maxWidth="xl">
            <div className="flex items-start justify-between gap-4 border-b border-outline/60 px-5 py-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">Share link</h2>
                <div className="flex items-center gap-2 text-xs text-foreground-muted">
                  {isBusy || isInitializingShare ? (
                    <i className="fa-solid fa-spinner fa-spin text-[11px]" />
                  ) : (
                    <i className="fa-solid fa-link text-[11px]" />
                  )}
                  <span>{statusText}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-block-highlight hover:text-foreground"
                aria-label="Close share dialog"
              >
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-4">
              {visibleError ? (
                <div className="flex flex-col gap-3 rounded-lg border border-status-error/20 bg-status-error/5 px-4 py-3 text-sm text-status-error sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <i className="fa-solid fa-circle-exclamation mt-0.5 text-sm" />
                    <p className="min-w-0 flex-1 leading-5">{visibleError}</p>
                  </div>
                  {!activeShare ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className={SECONDARY_SURFACE_CLASS_NAME}
                      onClick={() => void handleRetry()}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {hasLoadError ? (
                <div className="flex justify-end border-t border-outline/60 pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    className={SECONDARY_SURFACE_CLASS_NAME}
                    onClick={handleClose}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label
                      htmlFor={`share-link-${noteId}`}
                      className="block text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/70"
                    >
                      Link
                    </label>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        id={`share-link-${noteId}`}
                        readOnly
                        value={shareUrl}
                        placeholder={isInitializingShare ? 'Loading share settings' : 'Share link unavailable'}
                        disabled={!activeShare}
                        className={`${FIELD_CLASS_NAME} min-w-0 flex-1 font-mono text-xs`}
                      />

                      <div
                        className="relative w-full overflow-hidden transition-[width] duration-200 ease-out sm:w-[var(--document-share-copy-width)] sm:flex-none"
                        style={copyButtonContainerStyle}
                      >
                        <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 -z-10 invisible">
                          <span
                            ref={copyIdleMeasureRef}
                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border px-4 py-2 text-sm"
                          >
                            <i className="fa-solid fa-copy text-xs" />
                            <span>Copy</span>
                          </span>
                          <span
                            ref={copyCopiedMeasureRef}
                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border px-4 py-2 text-sm"
                          >
                            <i className="fa-solid fa-check text-xs" />
                            <span>Copied</span>
                          </span>
                        </div>

                        <Button
                          type="button"
                          variant="secondary"
                          className={`w-full ${SECONDARY_SURFACE_CLASS_NAME}`}
                          onClick={handleCopy}
                          disabled={!shareUrl}
                        >
                          <span
                            className={`inline-flex items-center gap-2 whitespace-nowrap transition-transform duration-200 ease-out ${copyState === 'copied' ? 'scale-[1.03]' : 'scale-100'}`}
                          >
                            <i className={`fa-solid ${copyState === 'copied' ? 'fa-check' : 'fa-copy'} text-xs`} />
                            <span>{copyState === 'copied' ? 'Copied' : 'Copy'}</span>
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-outline/60 pt-4 sm:grid-cols-[minmax(0,1fr)_10.5rem]">
                    <div className="space-y-2">
                      <label
                        htmlFor={`share-name-${noteId}`}
                        className="block text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/70"
                      >
                        Name
                      </label>
                      <input
                        id={`share-name-${noteId}`}
                        name="share-name"
                        type="text"
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        onBlur={() => void handleNameCommit()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            event.currentTarget.blur()
                          }

                          if (event.key === 'Escape') {
                            event.preventDefault()
                            setDraftName(activeShare?.name ?? defaultShareName)
                            event.currentTarget.blur()
                          }
                        }}
                        disabled={!activeShare || isBusy}
                        placeholder={defaultShareName}
                        className={FIELD_CLASS_NAME}
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor={`share-access-${noteId}`}
                        className="block text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/70"
                      >
                        Access
                      </label>

                      <div className="relative">
                        <select
                          id={`share-access-${noteId}`}
                          name="share-access"
                          value={draftAccessMode}
                          onChange={(event) =>
                            void handleAccessModeChange(event.target.value as DocumentShareAccessMode)
                          }
                          disabled={!activeShare || isBusy}
                          className={`${FIELD_CLASS_NAME} appearance-none pr-9`}
                        >
                          {ACCESS_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        <i className="pointer-events-none fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-foreground-muted" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-outline/60 pt-4">
                    {activeShare ? (
                      <button
                        type="button"
                        onClick={() => void handleDisable()}
                        disabled={isBusy}
                        className="cursor-pointer text-sm font-medium text-status-error transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Disable link
                      </button>
                    ) : (
                      <span className="text-xs text-foreground-muted" />
                    )}

                    <Button
                      type="button"
                      variant="secondary"
                      className={SECONDARY_SURFACE_CLASS_NAME}
                      onClick={handleClose}
                    >
                      Done
                    </Button>
                  </div>
                </>
              )}
            </div>
          </ModalContent>
        </div>
      </Modal>
    </>
  )
}
