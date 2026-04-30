import { useEffect, useMemo, useState } from 'react'
import { CONNECTION_CALLBACK_SOURCE, parseConnectionsCallback } from '@/lib/connectionsCallback'

type Status = 'loading' | 'success' | 'error' | 'closing'

export function ConnectionsCallback() {
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const callbackState = useMemo(() => parseConnectionsCallback(window.location.search), [])

  useEffect(() => {
    if (callbackState.status === 'error') {
      setStatus('error')
      setErrorMessage(callbackState.errorMessage)

      if (window.opener && callbackState.attemptId) {
        window.opener.postMessage(
          { source: CONNECTION_CALLBACK_SOURCE, status: 'error', attemptId: callbackState.attemptId },
          window.location.origin
        )
      }

      return
    }

    let closeTimer: number | null = null

    // Short delay to show success message, then close
    const timer = window.setTimeout(() => {
      setStatus('success')

      if (window.opener && callbackState.attemptId) {
        window.opener.postMessage(
          { source: CONNECTION_CALLBACK_SOURCE, status: callbackState.status, attemptId: callbackState.attemptId },
          window.location.origin
        )
      }

      // Close the popup after showing success
      closeTimer = window.setTimeout(() => {
        setStatus('closing')
        if (window.opener) {
          window.close()
          return
        }

        window.location.href = import.meta.env.BASE_URL || '/'
      }, 1500)
    }, 500)

    return () => {
      window.clearTimeout(timer)
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer)
      }
    }
  }, [callbackState.attemptId, callbackState.errorMessage, callbackState.status])

  const isUnknownResult = callbackState.status === 'unknown'

  const handleClose = () => {
    if (window.opener) {
      window.close()
      return
    }

    window.location.href = import.meta.env.BASE_URL || '/'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="text-center p-8">
        {status === 'loading' && (
          <>
            <i className="fa-solid fa-spinner fa-spin text-4xl text-primary mb-4"></i>
            <p className="text-lg">Completing connection...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <i className="fa-solid fa-circle-exclamation text-4xl text-status-error mb-4"></i>
            <p className="text-lg font-medium">Connection failed</p>
            <p className="text-foreground-muted mt-2">{errorMessage || 'Please close this window and try again.'}</p>
            <button
              type="button"
              className="mt-5 px-4 py-2 rounded-md border border-outline text-sm font-medium text-foreground hover:bg-block-highlight/40"
              onClick={handleClose}
            >
              Close window
            </button>
          </>
        )}
        {(status === 'success' || status === 'closing') && (
          <>
            <i className="fa-solid fa-check-circle text-4xl text-green-500 mb-4"></i>
            <p className="text-lg font-medium">{isUnknownResult ? 'Connection updated' : 'Connection successful!'}</p>
            <p className="text-foreground-muted mt-2">
              {status === 'closing'
                ? 'Closing window...'
                : isUnknownResult
                  ? 'Returning to Kanwas to verify your connection status.'
                  : 'You can close this window.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
