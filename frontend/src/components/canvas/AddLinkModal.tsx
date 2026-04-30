import { useState } from 'react'

interface AddLinkModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (url: string) => void
}

export function AddLinkModal({ isOpen, onClose, onSubmit }: AddLinkModalProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const validateUrl = (input: string): boolean => {
    try {
      new URL(input)
      return true
    } catch {
      return false
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!url.trim()) {
      setError('URL is required')
      return
    }

    // Add https:// if missing protocol
    let finalUrl = url.trim()
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl
    }

    if (!validateUrl(finalUrl)) {
      setError('Please enter a valid URL')
      return
    }

    onSubmit(finalUrl)
    setUrl('')
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-canvas rounded-2xl shadow-2xl border border-outline w-full max-w-md animate-[scaleIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline">
          <h2 className="text-lg font-semibold">Add Link</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-block-highlight transition-colors cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-2">URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-2 bg-editor border border-outline rounded-lg
                focus:outline-none focus:border-primary-button-outline
                text-foreground placeholder:text-foreground-muted"
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-status-error">{error}</p>}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline hover:bg-block-highlight transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary-button-background text-primary-button-foreground
                hover:bg-primary-button-active-background transition-colors cursor-pointer"
            >
              Add Link
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
