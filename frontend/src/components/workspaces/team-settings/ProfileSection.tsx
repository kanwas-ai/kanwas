import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { useMe, useUpdateProfileName } from '@/hooks/useMe'
import { normalizePersonName, validatePersonName } from '@/lib/personName'

interface ProfileSectionProps {
  isOpen: boolean
}

export function ProfileSection({ isOpen }: ProfileSectionProps) {
  const { data: me } = useMe(isOpen)
  const updateProfileName = useUpdateProfileName()
  const [profileName, setProfileName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setProfileName(me?.name ?? '')
    } else {
      setValidationError(null)
    }
  }, [me?.name, isOpen])

  const normalizedProfileName = normalizePersonName(profileName)
  const hasUnsavedChanges = me
    ? normalizedProfileName.length > 0 && normalizedProfileName !== normalizePersonName(me.name)
    : false

  const handleSave = async () => {
    if (!hasUnsavedChanges) return

    const error = validatePersonName(profileName)
    if (error) {
      setValidationError(error)
      return
    }

    try {
      const updatedUser = await updateProfileName.mutateAsync(normalizedProfileName)
      setProfileName(updatedUser.name)
      setValidationError(null)
    } catch {
      // Mutation hook displays a toast.
    }
  }

  return (
    <section className="rounded-xl border border-outline bg-editor/60 p-4">
      <label
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-muted"
        htmlFor="profile-name"
      >
        Your display name
      </label>
      <div className="mt-2 space-y-2">
        <input
          id="profile-name"
          type="text"
          value={profileName}
          onChange={(event) => {
            setProfileName(event.target.value)
            if (validationError) setValidationError(null)
          }}
          minLength={2}
          maxLength={80}
          className="w-full rounded-md border border-outline bg-canvas px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-focused-content"
          placeholder="Your name"
        />
        <Button
          variant="primary"
          onClick={() => void handleSave()}
          isLoading={updateProfileName.isPending}
          disabled={!hasUnsavedChanges}
          className="w-full"
        >
          Save
        </Button>
      </div>
      {validationError ? (
        <p className="mt-1.5 text-[11px] text-status-error">{validationError}</p>
      ) : hasUnsavedChanges ? (
        <p className="mt-1.5 text-[11px] text-focused-content">Unsaved changes</p>
      ) : null}
    </section>
  )
}
