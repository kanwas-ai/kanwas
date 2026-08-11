import { useEffect, useMemo, useState } from 'react'
import { parseSkillMd } from 'shared/skills'
import {
  createAdminSkill,
  deleteAdminSkill,
  fetchAdminSkills,
  updateAdminSkill,
  type AdminSkill,
  type AdminSkillCategory,
  type AdminSkillInput,
} from './api'

const CATEGORIES: AdminSkillCategory[] = ['craft', 'framework', 'workflow', 'custom']
const CONTROLLED_METADATA_KEYS = new Set(['name', 'description', 'category', 'featured'])

interface SkillDraft {
  name: string
  description: string
  body: string
  category: AdminSkillCategory
  featured: boolean
}

type EditorMode = 'create' | 'edit' | 'view'

function emptyDraft(): SkillDraft {
  return {
    name: '',
    description: '',
    body: '',
    category: 'custom',
    featured: false,
  }
}

function formatDate(value: string | null): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getExtraMetadata(skill: AdminSkill): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(skill.metadata ?? {})) {
    if (!CONTROLLED_METADATA_KEYS.has(key)) {
      extra[key] = value
    }
  }
  return extra
}

function formatMetadataJson(metadata: Record<string, unknown>): string {
  return Object.keys(metadata).length > 0 ? JSON.stringify(metadata, null, 2) : ''
}

function draftFromSkill(skill: AdminSkill): SkillDraft {
  return {
    name: skill.name,
    description: skill.description,
    body: skill.body,
    category: skill.category,
    featured: skill.featured,
  }
}

function parseMetadataJson(value: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) return {}

  const parsed = JSON.parse(trimmed) as unknown
  if (!isPlainObject(parsed)) {
    throw new Error('Extra metadata must be a JSON object')
  }

  return parsed
}

function buildPayload(draft: SkillDraft, metadataJson: string): AdminSkillInput {
  return {
    ...draft,
    metadata: parseMetadataJson(metadataJson),
  }
}

export function Skills() {
  const [skills, setSkills] = useState<AdminSkill[]>([])
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('view')
  const [draft, setDraft] = useState<SkillDraft>(() => emptyDraft())
  const [metadataJson, setMetadataJson] = useState('')
  const [importContent, setImportContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function loadSkills(nextSelectedId?: string | null) {
    setError(null)
    try {
      const data = await fetchAdminSkills()
      setSkills(data)

      const nextId =
        nextSelectedId && data.some((skill) => skill.id === nextSelectedId) ? nextSelectedId : (data[0]?.id ?? null)
      setSelectedSkillId(nextId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSkills()
  }, [])

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) ?? null,
    [selectedSkillId, skills]
  )

  const filteredSkills = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return skills

    return skills.filter((skill) => {
      return (
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.category.toLowerCase().includes(query)
      )
    })
  }, [skills, search])

  function startCreate() {
    setSelectedSkillId(null)
    setDraft(emptyDraft())
    setMetadataJson('')
    setImportContent('')
    setMessage(null)
    setError(null)
    setMode('create')
  }

  function startEdit(skill: AdminSkill) {
    setSelectedSkillId(skill.id)
    setDraft(draftFromSkill(skill))
    setMetadataJson(formatMetadataJson(getExtraMetadata(skill)))
    setImportContent('')
    setMessage(null)
    setError(null)
    setMode('edit')
  }

  function cancelEdit() {
    setMode('view')
    setImportContent('')
    setError(null)
    if (!selectedSkillId && skills[0]) {
      setSelectedSkillId(skills[0].id)
    }
  }

  function parseImport() {
    setError(null)
    const result = parseSkillMd(importContent)
    if (!result.success) {
      setError(result.error)
      return
    }

    const { name, description, featured, ...extraMetadata } = result.skill.metadata
    setDraft((current) => ({
      ...current,
      name,
      description,
      body: result.skill.body,
      featured: typeof featured === 'boolean' ? featured : current.featured,
    }))
    setMetadataJson(formatMetadataJson(extraMetadata as Record<string, unknown>))
    setImportContent('')
  }

  async function saveSkill(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const payload = buildPayload(draft, metadataJson)
      const saved =
        mode === 'edit' && selectedSkill
          ? await updateAdminSkill(selectedSkill.id, payload)
          : await createAdminSkill(payload)

      setMode('view')
      setMessage(`Saved ${saved.name}`)
      await loadSkills(saved.id)
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Extra metadata is not valid JSON')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save skill')
      }
    } finally {
      setSaving(false)
    }
  }

  async function removeSkill(skill: AdminSkill) {
    if (!confirm(`Delete ${skill.name}?`)) return

    setDeleting(true)
    setError(null)
    setMessage(null)

    try {
      await deleteAdminSkill(skill.id)
      setMessage(`Deleted ${skill.name}`)
      await loadSkills(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete skill')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <div className="loading">Loading...</div>

  const extraMetadata = selectedSkill ? getExtraMetadata(selectedSkill) : {}

  return (
    <div className="skills-page">
      <div className="skills-toolbar">
        <div>
          <h2>Skills</h2>
          <div className="text-muted">{skills.length} global system skills</div>
        </div>
        <button className="btn btn-primary" type="button" onClick={startCreate}>
          Add skill
        </button>
      </div>

      {error && <div className="template-error">{error}</div>}
      {message && <div className="template-success">{message}</div>}

      <div className="skills-layout">
        <div className="skills-list-panel">
          <div className="search-bar skills-search">
            <input
              type="text"
              placeholder="Search skills"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <table className="skills-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredSkills.map((skill) => (
                <tr
                  key={skill.id}
                  className={skill.id === selectedSkillId ? 'selected-row' : undefined}
                  onClick={() => {
                    setSelectedSkillId(skill.id)
                    setMode('view')
                    setError(null)
                    setMessage(null)
                  }}
                >
                  <td>
                    <div className="skill-name-cell">
                      <code>{skill.name}</code>
                      {skill.featured && <span className="badge badge-yellow">Featured</span>}
                    </div>
                    <div className="text-muted skill-description-cell">{skill.description}</div>
                  </td>
                  <td>
                    <span className="badge badge-gray">{skill.category}</span>
                  </td>
                  <td className="text-muted">{formatDate(skill.updatedAt)}</td>
                </tr>
              ))}
              {filteredSkills.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-muted" style={{ textAlign: 'center', padding: 32 }}>
                    No skills found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="skills-detail-panel">
          {mode === 'create' || mode === 'edit' ? (
            <form onSubmit={saveSkill} className="skill-form">
              <div className="skill-panel-header">
                <h3>{mode === 'create' ? 'Add Skill' : 'Edit Skill'}</h3>
                <div className="skill-panel-actions">
                  <button className="btn btn-secondary" type="button" onClick={cancelEdit} disabled={saving}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="skill-form-grid">
                <label>Name</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                    }))
                  }
                  placeholder="my-skill"
                  required
                />

                <label>Category</label>
                <select
                  value={draft.category}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, category: event.target.value as AdminSkillCategory }))
                  }
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <label>Featured</label>
                <label className="skill-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.featured}
                    onChange={(event) => setDraft((current) => ({ ...current, featured: event.target.checked }))}
                  />
                  Show as featured
                </label>
              </div>

              <label className="skill-field-label">Description</label>
              <textarea
                className="skill-description-input"
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                required
              />

              <label className="skill-field-label">Instructions</label>
              <textarea
                className="skill-body-input"
                value={draft.body}
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                required
              />

              <label className="skill-field-label">Extra Metadata JSON</label>
              <textarea
                className="skill-metadata-input"
                value={metadataJson}
                onChange={(event) => setMetadataJson(event.target.value)}
                placeholder='{"license":"MIT"}'
              />

              <div className="skill-import-panel">
                <label className="skill-field-label">Import SKILL.md</label>
                <textarea
                  className="skill-import-input"
                  value={importContent}
                  onChange={(event) => setImportContent(event.target.value)}
                  placeholder="---&#10;name: my-skill&#10;description: What this skill does&#10;---&#10;&#10;# My Skill"
                />
                <div className="skill-panel-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setImportContent('')}
                    disabled={!importContent.trim()}
                  >
                    Clear import
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={parseImport}
                    disabled={!importContent.trim()}
                  >
                    Parse import
                  </button>
                </div>
              </div>
            </form>
          ) : selectedSkill ? (
            <div className="skill-detail">
              <div className="skill-panel-header">
                <div>
                  <h3>{selectedSkill.name}</h3>
                  <div className="skill-detail-badges">
                    <span className="badge badge-gray">{selectedSkill.category}</span>
                    {selectedSkill.featured && <span className="badge badge-yellow">Featured</span>}
                  </div>
                </div>
                <div className="skill-panel-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => startEdit(selectedSkill)}>
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => void removeSkill(selectedSkill)}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>

              <div className="skill-detail-meta">
                <div>
                  <span className="text-muted">Created</span>
                  <div>{formatDate(selectedSkill.createdAt)}</div>
                </div>
                <div>
                  <span className="text-muted">Updated</span>
                  <div>{formatDate(selectedSkill.updatedAt)}</div>
                </div>
              </div>

              <div className="section">
                <h3>Description</h3>
                <p>{selectedSkill.description}</p>
              </div>

              <div className="section">
                <h3>Instructions</h3>
                <pre className="skill-body-preview">{selectedSkill.body}</pre>
              </div>

              {Object.keys(extraMetadata).length > 0 && (
                <div className="section">
                  <h3>Extra Metadata</h3>
                  <pre className="skill-body-preview">{formatMetadataJson(extraMetadata)}</pre>
                </div>
              )}
            </div>
          ) : (
            <div className="skill-empty-state">
              <div>No skill selected</div>
              <button className="btn btn-primary" type="button" onClick={startCreate}>
                Add skill
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
