import { useState } from 'react'
import type { SlackMessageData } from '@/api/slack'
import { fetchSlackMessage } from '@/api/slack'
import { useConnections } from '@/hooks/useConnections'
import { openConnectionsModal } from '@/store/useUIStore'

interface SlackPermalinkModalProps {
  isOpen: boolean
  onClose: () => void
  onMessageFetched: (data: SlackMessageData) => void
  workspaceId: string
}

const SLACK_PERMALINK_PATTERN = /^https:\/\/[a-z0-9-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+/

export function SlackPermalinkModal({ isOpen, onClose, onMessageFetched, workspaceId }: SlackPermalinkModalProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: connections } = useConnections(workspaceId)
  const isSlackConnected = connections?.some((c) => c.toolkit?.toLowerCase() === 'slack' && c.isConnected)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmed = url.trim()
    if (!trimmed) {
      setError('Paste a Slack message link')
      return
    }

    if (!SLACK_PERMALINK_PATTERN.test(trimmed)) {
      setError('Not a valid Slack message link')
      return
    }

    setLoading(true)
    try {
      const data = await fetchSlackMessage(workspaceId, trimmed)
      onMessageFetched(data)
      setUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch message')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="bg-editor rounded-lg shadow-lg border border-outline w-72"
      onMouseDownCapture={(e) => e.preventDefault()}
    >
      <form onSubmit={handleSubmit} className="p-3">
        <p className="text-sm font-medium text-foreground mb-2">Embed Slack Message</p>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter Slack message URL"
          className="w-full px-3 py-1.5 bg-canvas border border-outline rounded
            focus:outline-none focus:border-foreground-muted
            text-sm text-foreground placeholder:text-foreground-muted"
          autoFocus
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
        />
        {error && <p className="mt-1 text-xs text-status-error">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 px-3 py-1.5 text-sm rounded border border-outline
            hover:bg-block-highlight transition-colors cursor-pointer
            disabled:opacity-50"
        >
          {loading ? 'Fetching...' : 'Embed message'}
        </button>
        {!isSlackConnected && (
          <button
            type="button"
            onClick={() => {
              openConnectionsModal({ initialSearch: 'slack' })
              onClose()
            }}
            className="w-full mt-1.5 flex items-center justify-center gap-2 px-3 py-1.5 text-sm
              text-foreground-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <i className="fa-solid fa-plug text-xs" />
            Connect Slack
          </button>
        )}
      </form>
    </div>
  )
}
