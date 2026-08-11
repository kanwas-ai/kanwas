import { useEffect, useState } from 'react'
import { fetchLlmDefaults, updateLlmDefaults, type LlmDefaultConfig } from './api'
import {
  getAdminDefaultsHelpText,
  getAdminProviderOptions,
  getAdminServiceTierOptions,
  getDefaultLabel,
  parseAdminProvider,
  supportsServiceTierDefaults,
} from './llmConfig'

export function LlmDefaults() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [llmProvider, setLlmProvider] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmServiceTier, setLlmServiceTier] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const defaultLabel = getDefaultLabel(llmProvider)
  const serviceTierSupported = supportsServiceTierDefaults(llmProvider)

  useEffect(() => {
    setLoading(true)
    fetchLlmDefaults()
      .then(({ config }) => {
        setLlmProvider(config.llmProvider || '')
        setLlmModel(config.llmModel || '')
        setLlmServiceTier(config.llmServiceTier || '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load LLM defaults'))
      .finally(() => setLoading(false))
  }, [])

  const handleProviderChange = (value: string) => {
    setLlmProvider(value)
    setLlmModel('')
    if (!supportsServiceTierDefaults(value)) {
      setLlmServiceTier('')
    }
    setMessage(null)
  }

  const persistConfig = async (config: LlmDefaultConfig, successMessage: string) => {
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const result = await updateLlmDefaults(config)
      setLlmProvider(result.config.llmProvider || '')
      setLlmModel(result.config.llmModel || '')
      setLlmServiceTier(result.config.llmServiceTier || '')
      setMessage(successMessage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save LLM defaults')
    } finally {
      setSaving(false)
    }
  }

  const saveDefaults = () => {
    void persistConfig(
      {
        llmProvider: parseAdminProvider(llmProvider) ?? null,
        llmModel: llmModel || null,
        llmServiceTier: serviceTierSupported ? (llmServiceTier as LlmDefaultConfig['llmServiceTier']) || null : null,
      },
      'Saved LLM defaults'
    )
  }

  const clearDefaults = () => {
    void persistConfig(
      {
        llmProvider: null,
        llmModel: null,
        llmServiceTier: null,
      },
      'Cleared LLM defaults'
    )
  }

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div className="llm-defaults">
      <div className="section">
        <h3>LLM Defaults</h3>
        <div className="config-grid">
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
            onChange={(e) => {
              setLlmModel(e.target.value)
              setMessage(null)
            }}
            placeholder={defaultLabel}
          />

          {serviceTierSupported && (
            <>
              <label>Service tier</label>
              <select
                value={llmServiceTier}
                onChange={(e) => {
                  setLlmServiceTier(e.target.value)
                  setMessage(null)
                }}
              >
                <option value="">Project/API default</option>
                {getAdminServiceTierOptions().map((option) => (
                  <option key={option} value={option}>
                    {option === 'priority' ? 'Priority (faster)' : 'Default (standard)'}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <p className="text-muted" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
          {getAdminDefaultsHelpText(llmProvider)}
        </p>

        {error && <div className="template-error">{error}</div>}
        {message && <div className="template-success">{message}</div>}

        <div className="config-actions">
          <button className="btn btn-primary" onClick={saveDefaults} disabled={saving}>
            {saving ? 'Saving...' : 'Save defaults'}
          </button>
          <button className="btn btn-secondary" onClick={clearDefaults} disabled={saving}>
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
