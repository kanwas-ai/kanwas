import { useState } from 'react'
import { createDevUser } from './api'
import {
  getAdminDefaultsHelpText,
  getAdminProviderOptions,
  getAdminReasoningOptions,
  getDefaultLabel,
  supportsReasoningOverrides,
} from './llmConfig'

function uniqueEmail() {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `test_${ts}_${rand}@test.kanwas.ai`
}

function resolveFrontendOrigin(): string {
  if (typeof window === 'undefined') return ''
  const { hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5173'
  }
  return ''
}

export function DevTools() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [llmProvider, setLlmProvider] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const defaultLabel = getDefaultLabel(llmProvider)
  const reasoningOverrideSupported = supportsReasoningOverrides(llmProvider)

  const handleProviderChange = (value: string) => {
    setLlmProvider(value)
    setLlmModel('')
    if (!supportsReasoningOverrides(value)) {
      setReasoningEffort('')
    }
  }

  const handleCreate = async () => {
    const finalEmail = email || uniqueEmail()
    const finalName = name || finalEmail.split('@')[0].replace(/_/g, ' ')

    const config: Record<string, string> = {}
    if (llmProvider) config.llmProvider = llmProvider
    if (llmModel) config.llmModel = llmModel
    if (reasoningOverrideSupported && reasoningEffort) config.reasoningEffort = reasoningEffort

    setLoading(true)
    setError(null)
    try {
      const result = await createDevUser(finalEmail, finalName, config)
      if (result.error) {
        setError(result.error)
        return
      }

      window.open(`${resolveFrontendOrigin()}/dev-login.html?token=${result.token}`, '_blank')

      setName('')
      setEmail('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="section">
        <h3>Create User & Open App</h3>
        <p className="text-muted" style={{ marginBottom: 16, fontSize: 13 }}>
          Creates a new user with a workspace and opens the app logged in as that user.
        </p>

        <div className="config-grid">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="(auto-generated)" />

          <label>Email</label>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="(auto-generated unique)"
          />

          <label>Provider</label>
          <select value={llmProvider} onChange={(e) => handleProviderChange(e.target.value)}>
            <option value="">System default</option>
            {getAdminProviderOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label>Model</label>
          <input
            type="text"
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            placeholder={defaultLabel}
          />

          <label>Reasoning</label>
          {reasoningOverrideSupported ? (
            <select value={reasoningEffort} onChange={(e) => setReasoningEffort(e.target.value)}>
              <option value="">{defaultLabel}</option>
              {getAdminReasoningOptions(llmProvider).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-muted" style={{ fontSize: 13, paddingTop: 8 }}>
              Automatic (adaptive on Sonnet/Opus 4.6)
            </div>
          )}
        </div>

        <p className="text-muted" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
          {getAdminDefaultsHelpText(llmProvider)}
        </p>

        {error && (
          <div
            style={{
              color: 'var(--badge-red-text)',
              background: 'var(--badge-red-bg)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              marginTop: 12,
            }}
          >
            {error}
          </div>
        )}

        <div className="config-actions">
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating...' : 'Create & Open'}
          </button>
        </div>
      </div>
    </div>
  )
}
