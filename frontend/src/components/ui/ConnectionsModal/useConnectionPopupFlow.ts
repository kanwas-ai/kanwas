import { useCallback, useEffect, useRef, useState } from 'react'
import type { InitiateConnectionResult, ToolkitCustomAuthRequirements } from '@/api/connections'
import { isConnectionCallbackMessage, type ConnectionCallbackStatus } from '@/lib/connectionsCallback'
import { showToast } from '@/utils/toast'

type ActiveConnectionAttempt = {
  toolkit: string
  attemptId: string
}

type InitiateConnectionInput = {
  toolkit: string
  customAuth?: {
    mode?: string
    credentials?: Record<string, unknown>
  }
  attemptId: string
}

type BeginConnectionOutcome = 'started' | 'custom_auth_required'

type RefreshConnectionsInput = {
  waitForToolkit?: string
  timeoutMs?: number
  pollIntervalMs?: number
}

interface UseConnectionPopupFlowOptions {
  isOpen: boolean
  initiateConnection: (input: InitiateConnectionInput) => Promise<InitiateConnectionResult>
  refreshConnections: (options?: RefreshConnectionsInput) => Promise<boolean>
}

type PendingCustomAuthPrompt = {
  toolkit: string
  requirements: ToolkitCustomAuthRequirements
}

function createAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Failed to initiate connection'
}

function getAttemptInProgressMessage(toolkit?: string): string {
  if (toolkit) {
    return `Finish connecting "${toolkit}" before starting another connection.`
  }

  return 'Finish the current connection attempt before starting another one.'
}

function shouldRefreshConnections(status: ConnectionCallbackStatus): boolean {
  return status === 'success' || status === 'unknown'
}

export function useConnectionPopupFlow({
  isOpen,
  initiateConnection,
  refreshConnections,
}: UseConnectionPopupFlowOptions) {
  const [activeAttempt, setActiveAttempt] = useState<ActiveConnectionAttempt | null>(null)
  const [pendingCustomAuthPrompt, setPendingCustomAuthPrompt] = useState<PendingCustomAuthPrompt | null>(null)
  const [isSubmittingCustomAuth, setIsSubmittingCustomAuth] = useState(false)
  const activeAttemptRef = useRef<ActiveConnectionAttempt | null>(null)
  const refreshingAttemptIdsRef = useRef<Set<string>>(new Set())
  const popupRef = useRef<Window | null>(null)
  const popupPollTimerRef = useRef<number | null>(null)
  const popupTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    activeAttemptRef.current = activeAttempt
  }, [activeAttempt])

  const clearPopupTimers = useCallback(() => {
    if (popupPollTimerRef.current !== null) {
      window.clearInterval(popupPollTimerRef.current)
      popupPollTimerRef.current = null
    }

    if (popupTimeoutRef.current !== null) {
      window.clearTimeout(popupTimeoutRef.current)
      popupTimeoutRef.current = null
    }
  }, [])

  const cleanupPopup = useCallback(
    (options?: { closePopup?: boolean }) => {
      clearPopupTimers()

      const popup = popupRef.current
      popupRef.current = null

      if (!options?.closePopup || !popup || popup.closed) {
        return
      }

      try {
        popup.close()
      } catch {
        // no-op
      }
    },
    [clearPopupTimers]
  )

  const clearActiveAttempt = useCallback((attemptId: string) => {
    if (activeAttemptRef.current?.attemptId === attemptId) {
      activeAttemptRef.current = null
    }

    setActiveAttempt((current) => {
      if (!current || current.attemptId !== attemptId) {
        return current
      }

      activeAttemptRef.current = null
      return null
    })
  }, [])

  const syncToolkitActivation = useCallback(
    (attempt: ActiveConnectionAttempt) => {
      if (refreshingAttemptIdsRef.current.has(attempt.attemptId)) {
        return
      }

      refreshingAttemptIdsRef.current.add(attempt.attemptId)

      void refreshConnections({
        waitForToolkit: attempt.toolkit,
        timeoutMs: 60_000,
        pollIntervalMs: 2_000,
      }).finally(() => {
        refreshingAttemptIdsRef.current.delete(attempt.attemptId)
      })
    },
    [refreshConnections]
  )

  useEffect(() => {
    if (isOpen) {
      return
    }

    setPendingCustomAuthPrompt(null)
    setIsSubmittingCustomAuth(false)
  }, [isOpen])

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || !isConnectionCallbackMessage(event.data)) {
        return
      }

      const currentAttempt = activeAttemptRef.current
      if (!currentAttempt) {
        return
      }

      if (currentAttempt.attemptId !== event.data.attemptId) {
        return
      }

      cleanupPopup()
      clearActiveAttempt(currentAttempt.attemptId)

      if (shouldRefreshConnections(event.data.status)) {
        syncToolkitActivation(currentAttempt)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [clearActiveAttempt, cleanupPopup, syncToolkitActivation])

  useEffect(() => {
    return () => {
      cleanupPopup()
    }
  }, [cleanupPopup])

  const openAuthPopup = useCallback(
    (redirectUrl: string, attempt: ActiveConnectionAttempt) => {
      if (!redirectUrl) {
        throw new Error('Connection link was not returned. Please try again.')
      }

      cleanupPopup()

      const popup = window.open(redirectUrl, 'oauth-popup', 'width=600,height=700,scrollbars=yes')
      if (!popup) {
        throw new Error('Popup was blocked. Please allow popups and try again.')
      }

      popupRef.current = popup

      popupPollTimerRef.current = window.setInterval(() => {
        if (popup.closed) {
          cleanupPopup()
          clearActiveAttempt(attempt.attemptId)
          syncToolkitActivation(attempt)
        }
      }, 500)

      popupTimeoutRef.current = window.setTimeout(
        () => {
          cleanupPopup()
          clearActiveAttempt(attempt.attemptId)
        },
        5 * 60 * 1000
      )
    },
    [cleanupPopup, clearActiveAttempt, syncToolkitActivation]
  )

  const beginConnection = useCallback(
    async (
      toolkit: string,
      options?: {
        customAuth?: {
          mode?: string
          credentials?: Record<string, unknown>
        }
      }
    ): Promise<BeginConnectionOutcome> => {
      const existingAttempt = activeAttemptRef.current
      if (existingAttempt) {
        throw new Error(getAttemptInProgressMessage(existingAttempt.toolkit))
      }

      const attemptId = createAttemptId()
      const attempt: ActiveConnectionAttempt = { toolkit, attemptId }
      activeAttemptRef.current = attempt
      setActiveAttempt(attempt)

      try {
        const result = await initiateConnection({
          toolkit,
          attemptId,
          customAuth: options?.customAuth,
        })

        if (result.status === 'CUSTOM_AUTH_REQUIRED') {
          clearActiveAttempt(attemptId)

          if (result.requirements.authModes.length === 0) {
            showToast(
              `"${toolkit}" requires custom auth but no dynamic requirements were returned. Please contact support.`,
              'error'
            )
            return 'custom_auth_required'
          }

          setPendingCustomAuthPrompt({
            toolkit,
            requirements: result.requirements,
          })
          return 'custom_auth_required'
        }

        openAuthPopup(result.redirectUrl, attempt)
        return 'started'
      } catch (error) {
        cleanupPopup()
        clearActiveAttempt(attemptId)
        throw error
      }
    },
    [cleanupPopup, clearActiveAttempt, initiateConnection, openAuthPopup]
  )

  const connectToolkit = useCallback(
    async (toolkit: string) => {
      const existingAttempt = activeAttemptRef.current
      if (existingAttempt) {
        showToast(getAttemptInProgressMessage(existingAttempt.toolkit), 'error')
        return
      }

      try {
        await beginConnection(toolkit)
        return
      } catch (error) {
        showToast(getErrorMessage(error), 'error')
      }
    },
    [beginConnection]
  )

  const closeCustomAuthPrompt = useCallback(() => {
    if (isSubmittingCustomAuth) {
      return
    }

    setPendingCustomAuthPrompt(null)
  }, [isSubmittingCustomAuth])

  const submitCustomAuthPrompt = useCallback(
    async (payload: { mode: string; credentials: Record<string, string> }) => {
      if (!pendingCustomAuthPrompt) {
        return
      }

      setIsSubmittingCustomAuth(true)

      try {
        const outcome = await beginConnection(pendingCustomAuthPrompt.toolkit, {
          customAuth: {
            mode: payload.mode,
            credentials: payload.credentials,
          },
        })

        if (outcome === 'started') {
          setPendingCustomAuthPrompt(null)
        }
      } catch (error) {
        showToast(getErrorMessage(error), 'error')
      } finally {
        setIsSubmittingCustomAuth(false)
      }
    },
    [beginConnection, pendingCustomAuthPrompt]
  )

  return {
    activeAttempt,
    connectToolkit,
    pendingCustomAuthPrompt,
    isSubmittingCustomAuth,
    closeCustomAuthPrompt,
    submitCustomAuthPrompt,
  }
}
