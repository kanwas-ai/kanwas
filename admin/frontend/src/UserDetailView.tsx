import { useState, useEffect } from 'react'
import {
  fetchUser,
  updateUserConfig,
  impersonateUser,
  type UserDetail as UserDetailType,
  type ImpersonateResult,
} from './api'
import {
  getAdminDefaultsHelpText,
  getAdminProviderOptions,
  getAdminReasoningOptions,
  getDefaultLabel,
  supportsReasoningOverrides,
} from './llmConfig'

const STATUS_BADGE: Record<string, string> = {
  complete: 'badge-green',
  processing: 'badge-yellow',
  waiting: 'badge-blue',
  error: 'badge-red',
  initiated: 'badge-gray',
}

export function UserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [user, setUser] = useState<UserDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [impersonation, setImpersonation] = useState<ImpersonateResult | null>(null)

  // Config form state
  const [llmProvider, setLlmProvider] = useState<string>('')
  const [llmModel, setLlmModel] = useState<string>('')
  const [reasoningEffort, setReasoningEffort] = useState<string>('')
  const defaultLabel = getDefaultLabel(llmProvider)
  const reasoningOverrideSupported = supportsReasoningOverrides(llmProvider)

  const handleProviderChange = (value: string) => {
    setLlmProvider(value)
    setLlmModel('')
    if (!supportsReasoningOverrides(value)) {
      setReasoningEffort('')
    }
  }

  useEffect(() => {
    setLoading(true)
    setImpersonation(null)
    fetchUser(userId)
      .then((data) => {
        setUser(data)
        const nextProvider = (data.config.llmProvider as string) || ''
        setLlmProvider(nextProvider)
        setLlmModel((data.config.llmModel as string) || '')
        setReasoningEffort(
          supportsReasoningOverrides(nextProvider) ? (data.config.reasoningEffort as string) || '' : ''
        )
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [userId])

  const saveConfig = async () => {
    setSaving(true)
    try {
      const config: Record<string, unknown> = {
        llmProvider: llmProvider || null,
        llmModel: llmModel || null,
        reasoningEffort: reasoningOverrideSupported ? reasoningEffort || null : null,
      }
      const result = await updateUserConfig(userId, config)
      const savedProvider = (result.config.llmProvider as string) || ''
      setLlmProvider(savedProvider)
      setLlmModel((result.config.llmModel as string) || '')
      setReasoningEffort(
        supportsReasoningOverrides(savedProvider) ? (result.config.reasoningEffort as string) || '' : ''
      )
      setUser((prev) => (prev ? { ...prev, config: result.config } : prev))
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleImpersonate = async () => {
    try {
      const result = await impersonateUser(userId)
      setImpersonation(result)
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) return <div className="loading">Loading...</div>
  if (!user) return <div className="loading">User not found</div>

  return (
    <div className="user-detail">
      <a className="back" onClick={onBack}>
        &larr; Back to users
      </a>

      <div className="user-header">
        <h2>{user.name}</h2>
        <div className="email">{user.email}</div>
        <div className="user-meta">
          {user.organization && <span>{user.organization.name}</span>}
          {user.orgRole && (
            <span className={`badge ${user.orgRole === 'admin' ? 'badge-blue' : 'badge-gray'}`}>{user.orgRole}</span>
          )}
          <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Config Overrides */}
      <div className="section">
        <h3>Config Overrides</h3>
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
        <div className="config-actions">
          <button className="btn btn-primary" onClick={saveConfig} disabled={saving}>
            {saving ? 'Saving...' : 'Save config'}
          </button>
        </div>
      </div>

      {/* Usage */}
      {user.usage && (
        <div className="section">
          <h3>Usage</h3>
          <UsageBar label="Weekly" snapshot={user.usage.weekly} />
          <UsageBar label="Monthly" snapshot={user.usage.monthly} />
          {user.usage.isOutOfUsage && (
            <div className="badge badge-red" style={{ marginTop: 8 }}>
              Out of usage
            </div>
          )}
        </div>
      )}

      {/* Recent Tasks */}
      <div className="section">
        <h3>Recent Tasks</h3>
        {user.tasks.length === 0 ? (
          <div className="text-muted">No tasks yet</div>
        ) : (
          user.tasks.map((task) => (
            <div key={task.id} className="task-row">
              <span className={`badge ${STATUS_BADGE[task.status] || 'badge-gray'}`}>{task.status}</span>
              <span className="title">{task.title || task.description}</span>
              <span className="date">{new Date(task.createdAt).toLocaleDateString()}</span>
            </div>
          ))
        )}
      </div>

      {/* Impersonate */}
      <div className="section">
        <h3>Impersonate</h3>
        <button className="btn btn-secondary" onClick={handleImpersonate}>
          Login as {user.name}
        </button>
        {impersonation && (
          <div className="impersonate-result">
            <div style={{ marginBottom: 8 }}>
              Token generated for <strong>{impersonation.user.email}</strong>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                localStorage.setItem('auth_token', impersonation.token)
                window.open('/app/', '_blank')
              }}
            >
              Open app as {impersonation.user.name}
            </button>
            <div style={{ marginTop: 12 }}>
              <details>
                <summary style={{ cursor: 'pointer', color: '#737373', fontSize: 12 }}>Raw token</summary>
                <code>{impersonation.token}</code>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function UsageBar({
  label,
  snapshot,
}: {
  label: string
  snapshot: { usedCents: number; limitCents: number; percent: number }
}) {
  const color = snapshot.percent > 90 ? '#ef4444' : snapshot.percent > 70 ? '#f59e0b' : '#22c55e'

  return (
    <div className="usage-bar-container">
      <div className="usage-bar-label">
        <span>{label}</span>
        <span>
          ${(snapshot.usedCents / 100).toFixed(2)} / ${(snapshot.limitCents / 100).toFixed(2)} (
          {Math.round(snapshot.percent)}%)
        </span>
      </div>
      <div className="usage-bar">
        <div className="usage-bar-fill" style={{ width: `${Math.min(snapshot.percent, 100)}%`, background: color }} />
      </div>
    </div>
  )
}
