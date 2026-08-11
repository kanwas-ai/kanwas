import { useEffect, useState } from 'react'
import { addEmbedTemplate, fetchEmbedTemplates, removeEmbedTemplate, type EmbedTemplate } from './api'

export function EmbedTemplates() {
  const [templates, setTemplates] = useState<EmbedTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setError(null)
    try {
      const data = await fetchEmbedTemplates()
      setTemplates(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load embed templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = workspaceId.trim()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)
    try {
      await addEmbedTemplate(trimmed)
      setWorkspaceId('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add embed template')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm('Remove embed template flag from this workspace?')) return
    setError(null)
    try {
      await removeEmbedTemplate(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove embed template')
    }
  }

  return (
    <>
      <div className="search-bar" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, flex: 1 }}>
          <input
            type="text"
            placeholder="Workspace UUID to flag as embed template"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            disabled={submitting}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={submitting || !workspaceId.trim()}>
            {submitting ? 'Adding…' : 'Add template'}
          </button>
        </form>
      </div>

      {error ? (
        <div className="text-muted" style={{ color: 'var(--badge-red-text)', padding: '8px 0' }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Workspace ID</th>
              <th>Organization</th>
              <th>Created</th>
              <th style={{ width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="text-muted">
                  <code>{t.id}</code>
                </td>
                <td className="text-muted">
                  <code>{t.organizationId}</code>
                </td>
                <td className="text-muted">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td>
                  <button type="button" onClick={() => handleRemove(t.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 40 }}>
                  No embed templates yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  )
}
