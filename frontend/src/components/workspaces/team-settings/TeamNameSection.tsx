import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { useOrganization, useUpdateOrganization } from '@/hooks/useOrganizations'

interface TeamNameSectionProps {
  workspaceId?: string
  isOpen: boolean
}

export function TeamNameSection({ workspaceId, isOpen }: TeamNameSectionProps) {
  const { data: organization, isLoading, isError, error, refetch } = useOrganization(workspaceId)
  const updateOrganization = useUpdateOrganization(workspaceId)
  const isAdmin = organization?.role === 'admin'
  const [name, setName] = useState('')

  useEffect(() => {
    if (isOpen) {
      setName(organization?.name ?? '')
    }
  }, [organization?.name, isOpen])

  const hasUnsavedName = organization ? name.trim().length > 0 && name.trim() !== organization.name : false

  const handleSave = async () => {
    if (!hasUnsavedName) return
    try {
      await updateOrganization.mutateAsync(name.trim())
    } catch {
      // Mutation hook displays a toast.
    }
  }

  return (
    <section className="rounded-xl border border-outline bg-editor/60 p-4">
      <label
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-muted"
        htmlFor="team-name"
      >
        Team name
      </label>

      {isLoading ? (
        <div className="mt-2 h-9 rounded-md bg-block-highlight animate-pulse" />
      ) : isError ? (
        <div className="mt-2 rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-xs text-status-error space-y-2">
          <p>{error instanceof Error ? error.message : 'Unable to load team details.'}</p>
          <Button size="sm" variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <input
            id="team-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!isAdmin}
            className="w-full rounded-md border border-outline bg-canvas px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-focused-content disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Team name"
          />
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            isLoading={updateOrganization.isPending}
            disabled={!isAdmin || !hasUnsavedName}
            className="w-full"
          >
            Save
          </Button>
          {hasUnsavedName ? <p className="text-[11px] text-focused-content">Unsaved changes</p> : null}
        </div>
      )}
    </section>
  )
}
