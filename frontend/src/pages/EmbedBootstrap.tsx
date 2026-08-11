import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { tuyau } from '@/api/client'
import { useAuth } from '@/providers/auth'
import { fromUrlUuid, toUrlUuid } from '@/utils/uuid'

export const EmbedBootstrap = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setToken } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const hasBootstrapped = useRef(false)

  useEffect(() => {
    if (hasBootstrapped.current) {
      return
    }

    hasBootstrapped.current = true

    const rawTemplateId = searchParams.get('template')
    const trimmedTemplateId = rawTemplateId?.trim()
    const normalizedTemplateId =
      trimmedTemplateId && trimmedTemplateId.length === 32 && !trimmedTemplateId.includes('-')
        ? fromUrlUuid(trimmedTemplateId)
        : trimmedTemplateId || undefined

    const bootstrap = async () => {
      try {
        if (!normalizedTemplateId) {
          throw new Error('Missing template id')
        }

        const response = await tuyau.embed.bootstrap.$post({ templateId: normalizedTemplateId })

        if (response.error) {
          const responseError = response.error as { error?: string; message?: string }
          throw new Error(responseError?.error || responseError?.message || 'Failed to bootstrap workspace')
        }

        const responseData = response.data
        if (!responseData) {
          throw new Error('Bootstrap response missing payload')
        }

        const workspaceId = responseData.workspaceId || responseData.workspace?.id
        if (!workspaceId) {
          throw new Error('Bootstrap response missing workspace id')
        }

        const { value: token } = responseData
        setToken(token)
        navigate(`/w/${toUrlUuid(workspaceId)}`, { replace: true })
      } catch (bootstrapError) {
        const message = bootstrapError instanceof Error ? bootstrapError.message : 'Failed to bootstrap workspace'
        setError(message)
      }
    }

    void bootstrap()
  }, [navigate, searchParams, setToken])

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas text-foreground">
      <div className="w-full max-w-md rounded-[24px] border-2 border-outline bg-editor p-8 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-medium">Unable to start workspace</h1>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 w-full h-[38px] flex justify-center items-center gap-2 px-[15px] py-[7px] rounded-[16px] border border-[#656565] text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focused-content"
              style={{ background: 'linear-gradient(180deg, #393939 0%, #1D1D1D 100%)' }}
            >
              Retry
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-medium">Setting up your workspace</h1>
            <p className="mt-2 text-sm text-muted">Just a moment...</p>
          </>
        )}
      </div>
    </div>
  )
}
