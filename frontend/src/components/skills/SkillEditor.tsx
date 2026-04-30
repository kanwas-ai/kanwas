import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { parseSkillMd } from 'shared/skills'
import type { Skill } from '@/api/skills'

type EditorMode = 'form' | 'import'

interface SkillEditorProps {
  // If skill is provided, we're editing. Otherwise, creating.
  skill?: Skill | null
  onClose: () => void
  onSave: (data: {
    name: string
    description: string
    body: string
    metadata?: Record<string, unknown>
  }) => Promise<void>
  isSaving: boolean
}

export function SkillEditor({ skill, onClose, onSave, isSaving }: SkillEditorProps) {
  const isEditing = !!skill
  const [mode, setMode] = useState<EditorMode>('form')

  // Form state
  const [name, setName] = useState(skill?.name ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const [body, setBody] = useState(skill?.body ?? '')
  const [errors, setErrors] = useState<{ name?: string; description?: string; body?: string }>({})
  // Imported metadata (fields other than name/description from SKILL.md import)
  const [importedMetadata, setImportedMetadata] = useState<Record<string, unknown> | null>(null)

  // Import state
  const [importContent, setImportContent] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  // Reset form when skill changes
  useEffect(() => {
    setName(skill?.name ?? '')
    setDescription(skill?.description ?? '')
    setBody(skill?.body ?? '')
    setErrors({})
    setImportedMetadata(null) // Clear imported metadata on skill change
    setMode('form')
    setImportContent('')
    setImportError(null)
  }, [skill])

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const validateName = (value: string) => {
    if (!value.trim()) return 'Name is required'
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
      return 'Must be lowercase with hyphens (e.g., my-skill)'
    }
    if (value.length > 64) return 'Must be 64 characters or less'
    return undefined
  }

  const validate = () => {
    const newErrors: typeof errors = {}

    const nameError = validateName(name)
    if (nameError) newErrors.name = nameError

    if (!description.trim()) {
      newErrors.description = 'Description is required'
    } else if (description.length > 1024) {
      newErrors.description = 'Must be 1024 characters or less'
    }

    if (!body.trim()) {
      newErrors.body = 'Instructions are required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    // Merge imported metadata with existing skill metadata (if editing)
    const metadata = {
      ...(skill?.metadata ?? {}),
      ...(importedMetadata ?? {}),
    }
    // Only pass metadata if there's something other than what's in name/description
    const hasExtraMetadata = Object.keys(metadata).some((k) => k !== 'name' && k !== 'description')
    await onSave({ name, description, body, metadata: hasExtraMetadata ? metadata : undefined })
  }

  const handleImportParse = useCallback(() => {
    if (!importContent.trim()) {
      setImportError('Paste SKILL.md content above')
      return
    }

    const result = parseSkillMd(importContent)
    if (result.success) {
      // Extract name and description for form fields
      setName(result.skill.metadata.name)
      setDescription(result.skill.metadata.description ?? '')
      setBody(result.skill.body)
      // Preserve all other metadata (license, featured, compatibility, allowed-tools, etc.)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { name: _n, description: _d, ...restMetadata } = result.skill.metadata
      if (Object.keys(restMetadata).length > 0) {
        setImportedMetadata(restMetadata as Record<string, unknown>)
      }
      setMode('form')
      setImportContent('')
      setImportError(null)
    } else {
      setImportError(result.error)
    }
  }, [importContent])

  const hasChanges = isEditing
    ? name !== skill?.name || description !== skill?.description || body !== skill?.body
    : name.trim() !== '' || description.trim() !== '' || body.trim() !== ''

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-canvas border border-outline shadow-2xl flex flex-col w-[90vw] h-[85vh] max-w-[900px] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{isEditing ? 'Edit Skill' : 'Create Skill'}</h2>
            <p className="text-sm text-foreground-muted mt-0.5">
              {isEditing ? 'Modify the skill configuration' : 'Create a new custom skill'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-lg hover:bg-block-highlight transition-colors cursor-pointer flex items-center justify-center"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-foreground-muted text-lg" />
          </button>
        </header>

        {/* Mode tabs (only for create) */}
        {!isEditing && (
          <div className="px-6 pt-4 flex gap-1">
            <button
              onClick={() => setMode('form')}
              className={`px-4 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                mode === 'form'
                  ? 'bg-foreground text-canvas font-medium'
                  : 'text-foreground-muted hover:text-foreground hover:bg-block-highlight'
              }`}
            >
              Form
            </button>
            <button
              onClick={() => setMode('import')}
              className={`px-4 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                mode === 'import'
                  ? 'bg-foreground text-canvas font-medium'
                  : 'text-foreground-muted hover:text-foreground hover:bg-block-highlight'
              }`}
            >
              Import SKILL.md
            </button>
          </div>
        )}

        {/* Content */}
        {mode === 'form' ? (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Name field */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Skill Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }))
                  }}
                  className={`w-full px-4 py-2.5 text-sm bg-block-highlight/50 border ${
                    errors.name ? 'border-status-error' : 'border-outline'
                  } focus:border-foreground/30 focus:outline-none text-foreground font-mono`}
                  placeholder="my-skill-name"
                />
                {errors.name ? (
                  <p className="mt-1.5 text-xs text-status-error">{errors.name}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-foreground-muted">
                    Invoke with <span className="font-mono text-foreground-muted/70">/{name || 'skill-name'}</span>
                  </p>
                )}
              </div>

              {/* Description field */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }))
                  }}
                  className={`w-full px-4 py-2.5 text-sm bg-block-highlight/50 border ${
                    errors.description ? 'border-status-error' : 'border-outline'
                  } focus:border-foreground/30 focus:outline-none text-foreground`}
                  placeholder="A brief description of what this skill does"
                />
                {errors.description && <p className="mt-1.5 text-xs text-status-error">{errors.description}</p>}
              </div>

              {/* Body/Instructions field */}
              <div className="flex-1 flex flex-col">
                <label className="block text-sm font-medium text-foreground mb-2">Instructions</label>
                <textarea
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value)
                    if (errors.body) setErrors((prev) => ({ ...prev, body: undefined }))
                  }}
                  className={`flex-1 min-h-[300px] w-full px-4 py-3 text-sm bg-block-highlight/50 border ${
                    errors.body ? 'border-status-error' : 'border-outline'
                  } focus:border-foreground/30 focus:outline-none text-foreground font-mono resize-none leading-relaxed`}
                  placeholder="# My Skill

Instructions for the AI when this skill is activated...

## Guidelines
- Step 1
- Step 2"
                />
                {errors.body && <p className="mt-1.5 text-xs text-status-error">{errors.body}</p>}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-outline flex gap-3 justify-end flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-sm border border-outline hover:bg-block-highlight transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !hasChanges}
                className="px-5 py-2.5 text-sm bg-foreground text-canvas hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                {isSaving ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin text-[12px]" />
                    {isEditing ? 'Saving...' : 'Creating...'}
                  </>
                ) : isEditing ? (
                  'Save Changes'
                ) : (
                  'Create Skill'
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Import mode */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="text-sm text-foreground-muted mb-4">
                Paste the contents of a SKILL.md file to import it as a new skill.
              </p>
              <textarea
                value={importContent}
                onChange={(e) => {
                  setImportContent(e.target.value)
                  setImportError(null)
                }}
                className="w-full h-[400px] px-4 py-3 text-sm bg-block-highlight/50 border border-outline focus:border-foreground/30 focus:outline-none text-foreground font-mono resize-none leading-relaxed"
                placeholder={`---
name: my-skill
description: What this skill does
---

# My Skill

Instructions for the AI...`}
              />
              {importError && (
                <div className="mt-3 px-4 py-3 bg-status-error/10 border border-status-error/20 text-sm text-status-error">
                  <i className="fa-solid fa-xmark mr-2" />
                  {importError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-outline flex gap-3 justify-end flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-sm border border-outline hover:bg-block-highlight transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportParse}
                disabled={!importContent.trim()}
                className="px-5 py-2.5 text-sm bg-foreground text-canvas hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                <i className="fa-solid fa-file-import text-[12px]" />
                Parse & Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
