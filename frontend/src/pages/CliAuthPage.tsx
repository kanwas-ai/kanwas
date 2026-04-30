import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthState } from '@/providers/auth'
import { baseURL } from '@/api/client'
import kanwasLogo from '@/assets/kanwas-logo-web.png'

type PageState = 'ready' | 'authorizing' | 'success' | 'error' | 'expired'

export const CliAuthPage = () => {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')
  const { user, token } = useAuthState()
  const [pageState, setPageState] = useState<PageState>(code ? 'ready' : 'error')
  const [errorMessage, setErrorMessage] = useState(code ? '' : 'No authorization code provided.')

  const handleAuthorize = async () => {
    if (!code || !token) return

    setPageState('authorizing')

    try {
      const res = await fetch(`${baseURL}/auth/cli/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 404) {
          setPageState('expired')
        } else {
          setErrorMessage(data.error || 'Authorization failed')
          setPageState('error')
        }
        return
      }

      setPageState('success')
    } catch {
      setErrorMessage('Network error. Please try again.')
      setPageState('error')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-canvas font-['Inter',system-ui,sans-serif]">
      <div className="max-w-md w-full space-y-8 p-8 bg-editor rounded-[24px] border-2 border-outline">
        {pageState === 'success' ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
              <i className="fa-solid fa-check text-xl" />
            </div>
            <h2 className="text-center text-3xl font-medium text-foreground">Authorized</h2>
            <p className="text-center text-sm text-muted">You can close this window and return to your terminal.</p>
          </div>
        ) : pageState === 'expired' ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <i className="fa-solid fa-clock text-xl" />
            </div>
            <h2 className="text-center text-3xl font-medium text-foreground">Code Expired</h2>
            <p className="text-center text-sm text-muted">
              This authorization code has expired. Please run{' '}
              <code className="rounded bg-canvas px-1.5 py-0.5 text-xs">kanwas init</code> again.
            </p>
          </div>
        ) : pageState === 'error' ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <i className="fa-solid fa-exclamation-triangle text-xl" />
            </div>
            <h2 className="text-center text-3xl font-medium text-foreground">Error</h2>
            <p className="text-center text-sm text-muted">{errorMessage}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center space-y-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-canvas text-foreground-muted">
                <i className="fa-solid fa-terminal text-xl" />
              </div>
              <h2 className="text-center text-3xl font-medium text-foreground">Authorize CLI</h2>
              <p className="text-center text-sm text-muted">Kanwas CLI is requesting access to your account</p>
            </div>

            {user && (
              <div className="text-center text-sm text-foreground-muted">
                Signed in as <span className="font-medium text-foreground">{user.name}</span>
                {user.email && <span className="text-muted"> ({user.email})</span>}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleAuthorize}
                disabled={pageState === 'authorizing'}
                className="w-full h-[38px] flex justify-center items-center gap-2 px-[15px] py-[7px] rounded-[16px] border border-[#656565] text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focused-content disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                style={{ background: 'linear-gradient(180deg, #393939 0%, #1D1D1D 100%)' }}
              >
                {pageState === 'authorizing' ? 'Authorizing...' : 'Authorize'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="mt-6">
        <img src={kanwasLogo} alt="Kanwas" className="w-[100px]" />
      </div>
    </div>
  )
}
