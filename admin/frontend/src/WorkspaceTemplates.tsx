import { useEffect, useRef, useState } from 'react'
import {
  clearDefaultWorkspaceTemplate,
  exportWorkspaceTemplate,
  fetchDefaultWorkspaceTemplate,
  fetchWorkspaces,
  type AdminWorkspaceSummary,
  type DefaultWorkspaceTemplateMetadata,
  type PortableWorkspaceTemplateFile,
  uploadDefaultWorkspaceTemplate,
} from './api'

function formatDate(value: string | null): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function buildDownloadFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'workspace'}-template.json`
}

export function WorkspaceTemplates() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [search, setSearch] = useState('')
  const [workspaces, setWorkspaces] = useState<AdminWorkspaceSummary[]>([])
  const [activeTemplate, setActiveTemplate] = useState<DefaultWorkspaceTemplateMetadata | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true)
  const [loadingTemplate, setLoadingTemplate] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [downloadingWorkspaceId, setDownloadingWorkspaceId] = useState<string | null>(null)

  async function loadWorkspaces(nextSearch?: string) {
    setLoadingWorkspaces(true)
    try {
      setWorkspaces(await fetchWorkspaces(nextSearch))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspaces')
    } finally {
      setLoadingWorkspaces(false)
    }
  }

  async function loadActiveTemplate() {
    setLoadingTemplate(true)
    try {
      const result = await fetchDefaultWorkspaceTemplate()
      setActiveTemplate(result.template)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load default workspace template')
    } finally {
      setLoadingTemplate(false)
    }
  }

  useEffect(() => {
    void Promise.all([loadWorkspaces(), loadActiveTemplate()])
  }, [])

  async function handleDownload(workspace: AdminWorkspaceSummary) {
    setError(null)
    setMessage(null)
    setDownloadingWorkspaceId(workspace.id)

    try {
      const template = await exportWorkspaceTemplate(workspace.id)
      downloadJson(buildDownloadFilename(workspace.name), template)
      setMessage(`Downloaded template for ${workspace.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export workspace template')
    } finally {
      setDownloadingWorkspaceId(null)
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError('Choose a template JSON file first')
      return
    }

    setUploading(true)
    setError(null)
    setMessage(null)

    try {
      const text = await selectedFile.text()
      const payload = JSON.parse(text) as PortableWorkspaceTemplateFile
      const result = await uploadDefaultWorkspaceTemplate(payload)
      setActiveTemplate(result.template)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setMessage(`Uploaded ${selectedFile.name} as the default workspace template`)
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Template file is not valid JSON')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to upload workspace template')
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleClear() {
    setClearing(true)
    setError(null)
    setMessage(null)

    try {
      await clearDefaultWorkspaceTemplate()
      setActiveTemplate(null)
      setMessage('Cleared uploaded default workspace template. New workspaces will use the minimal built-in workspace.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear default workspace template')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div>
      <div className="section">
        <h3>Default Workspace</h3>
        {loadingTemplate ? (
          <div className="loading">Loading...</div>
        ) : activeTemplate ? (
          <div className="template-card">
            <div className="template-card-row">
              <span className="template-label">Active template</span>
              <strong>{activeTemplate.name}</strong>
            </div>
            <div className="template-meta-grid">
              <div>
                <span className="text-muted">Version</span>
                <div>{activeTemplate.version}</div>
              </div>
              <div>
                <span className="text-muted">Exported</span>
                <div>{formatDate(activeTemplate.exportedAt)}</div>
              </div>
              <div>
                <span className="text-muted">Updated</span>
                <div>{formatDate(activeTemplate.updatedAt)}</div>
              </div>
            </div>
            <div className="template-actions">
              <button className="btn btn-danger" onClick={handleClear} disabled={clearing}>
                {clearing ? 'Clearing...' : 'Clear Uploaded Template'}
              </button>
            </div>
          </div>
        ) : (
          <div className="template-card">
            <div>No uploaded template is active.</div>
            <div className="text-muted" style={{ marginTop: 6 }}>
              New workspaces currently fall back to the minimal built-in workspace with only `instructions`.
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <h3>Upload Template</h3>
        <div className="template-upload-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
          <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload as Default'}
          </button>
        </div>
        <div className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>
          Hard errors are returned for non-portable templates. Image nodes are bundled in the JSON; file, audio, and
          link preview-image nodes are not allowed.
        </div>
      </div>

      <div className="section">
        <h3>Export Workspace Template</h3>
        <form
          className="template-search"
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            setMessage(null)
            void loadWorkspaces(search)
          }}
        >
          <input
            type="text"
            placeholder="Search by workspace, organization, or workspace ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-secondary" type="submit" disabled={loadingWorkspaces}>
            Search
          </button>
        </form>

        {error && <div className="template-error">{error}</div>}
        {message && <div className="template-success">{message}</div>}

        {loadingWorkspaces ? (
          <div className="loading">Loading...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Organization</th>
                <th>Updated</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((workspace) => (
                <tr key={workspace.id} style={{ cursor: 'default' }}>
                  <td>{workspace.name}</td>
                  <td>{workspace.organization?.name ?? <span className="text-muted">—</span>}</td>
                  <td className="text-muted">{formatDate(workspace.updatedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => void handleDownload(workspace)}
                      disabled={downloadingWorkspaceId === workspace.id}
                    >
                      {downloadingWorkspaceId === workspace.id ? 'Downloading...' : 'Download JSON'}
                    </button>
                  </td>
                </tr>
              ))}
              {workspaces.length === 0 && (
                <tr style={{ cursor: 'default' }}>
                  <td colSpan={4} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>
                    No workspaces found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
