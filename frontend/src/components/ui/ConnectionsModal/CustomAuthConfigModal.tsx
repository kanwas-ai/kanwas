import { useEffect, useMemo, useState } from 'react'
import type { CustomAuthField, CustomAuthModeRequirements, ToolkitCustomAuthRequirements } from '@/api/connections'
import { Button } from '@/components/ui/Button'
import { Modal, ModalContent } from '@/components/ui/Modal'
import {
  CUSTOM_AUTH_SELECT_CUSTOM_VALUE,
  getCustomAuthSelectState,
  getInitialCustomAuthFieldValue,
  resolveCustomAuthFieldControl,
} from './customAuthFieldUi'

interface CustomAuthConfigModalProps {
  isOpen: boolean
  toolkit: string
  requirements: ToolkitCustomAuthRequirements | null
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (payload: { mode: string; credentials: Record<string, string> }) => Promise<void>
}

function getModeKey(mode: CustomAuthModeRequirements): string {
  return `${mode.mode}:${mode.name}`
}

function buildInitialValues(mode: CustomAuthModeRequirements): Record<string, string> {
  const initialValues: Record<string, string> = {}

  for (const field of [...mode.authConfigCreation.required, ...mode.authConfigCreation.optional]) {
    initialValues[field.name] = getInitialCustomAuthFieldValue(field)
  }

  return initialValues
}

function getModeLabel(mode: CustomAuthModeRequirements): string {
  return `${mode.mode} (${mode.name})`
}

export function CustomAuthConfigModal({
  isOpen,
  toolkit,
  requirements,
  isSubmitting,
  onClose,
  onSubmit,
}: CustomAuthConfigModalProps) {
  const authModes = useMemo(() => requirements?.authModes ?? [], [requirements])
  const [selectedModeKey, setSelectedModeKey] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [showOptional, setShowOptional] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const selectedMode = useMemo(
    () => authModes.find((mode) => getModeKey(mode) === selectedModeKey) ?? authModes[0],
    [authModes, selectedModeKey]
  )

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const defaultMode = authModes[0]
    const nextModeKey = defaultMode ? getModeKey(defaultMode) : ''
    setSelectedModeKey(nextModeKey)
    setValues(defaultMode ? buildInitialValues(defaultMode) : {})
    setShowOptional(false)
    setFieldErrors({})
  }, [authModes, isOpen, toolkit])

  useEffect(() => {
    if (!isOpen || !selectedMode) {
      return
    }

    setValues(buildInitialValues(selectedMode))
    setFieldErrors({})
    setShowOptional(false)
  }, [isOpen, selectedModeKey, selectedMode])

  const updateFieldValue = (fieldName: string, value: string) => {
    setValues((current) => ({
      ...current,
      [fieldName]: value,
    }))

    if (fieldErrors[fieldName]) {
      setFieldErrors((current) => {
        const nextErrors = { ...current }
        delete nextErrors[fieldName]
        return nextErrors
      })
    }
  }

  const renderField = (field: CustomAuthField) => {
    const value = values[field.name] ?? ''
    const hasError = !!fieldErrors[field.name]
    const fieldControl = resolveCustomAuthFieldControl(field, value)
    const selectState = fieldControl === 'select' ? getCustomAuthSelectState(field, value) : null
    const inputClassName = `
      w-full rounded-md border bg-editor px-3 py-2 text-sm text-foreground
      focus:outline-none focus:ring-1 focus:ring-focused-content
      ${hasError ? 'border-status-error/70' : 'border-outline'}
    `

    return (
      <div key={field.name} className="space-y-1.5">
        <label
          className="flex items-center gap-1 text-xs font-medium text-foreground-muted"
          htmlFor={`custom-auth-${field.name}`}
        >
          <span>{field.displayName || field.name}</span>
          {field.required ? <span className="text-status-error">*</span> : null}
        </label>

        {fieldControl === 'textarea' ? (
          <textarea
            id={`custom-auth-${field.name}`}
            rows={3}
            value={value}
            onChange={(event) => updateFieldValue(field.name, event.target.value)}
            className={`${inputClassName} resize-y`}
            disabled={isSubmitting}
          />
        ) : fieldControl === 'select' && selectState ? (
          <div className="space-y-2">
            <select
              id={`custom-auth-${field.name}`}
              value={selectState.selectValue}
              onChange={(event) => {
                const selectedValue = event.target.value
                if (selectedValue === CUSTOM_AUTH_SELECT_CUSTOM_VALUE) {
                  if (!selectState.isCustomValue) {
                    updateFieldValue(field.name, '')
                  }
                  return
                }

                updateFieldValue(field.name, selectedValue)
              }}
              className={inputClassName}
              disabled={isSubmitting}
            >
              {selectState.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              {selectState.allowCustomValue ? (
                <option value={CUSTOM_AUTH_SELECT_CUSTOM_VALUE}>Custom value</option>
              ) : null}
            </select>

            {selectState.allowCustomValue && selectState.isCustomValue ? (
              <input
                id={`custom-auth-${field.name}-custom`}
                type="text"
                value={value}
                onChange={(event) => updateFieldValue(field.name, event.target.value)}
                className={inputClassName}
                disabled={isSubmitting}
                placeholder={field.uiHints?.customValuePlaceholder || 'Enter a custom value'}
              />
            ) : null}
          </div>
        ) : (
          <input
            id={`custom-auth-${field.name}`}
            type={fieldControl === 'password' ? 'password' : 'text'}
            value={value}
            onChange={(event) => updateFieldValue(field.name, event.target.value)}
            className={inputClassName}
            disabled={isSubmitting}
          />
        )}

        {field.uiHints?.helpText ? <p className="text-[11px] text-foreground-muted">{field.uiHints.helpText}</p> : null}
        {field.description ? <p className="text-[11px] text-foreground-muted">{field.description}</p> : null}
        {hasError ? <p className="text-[11px] text-status-error">{fieldErrors[field.name]}</p> : null}
      </div>
    )
  }

  const handleSubmit = async () => {
    if (!selectedMode) {
      return
    }

    const nextErrors: Record<string, string> = {}

    for (const field of selectedMode.authConfigCreation.required) {
      const value = values[field.name] ?? ''
      if (value.trim().length === 0) {
        nextErrors[field.name] = `${field.displayName || field.name} is required`
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }

    const credentials: Record<string, string> = {}

    for (const field of [...selectedMode.authConfigCreation.required, ...selectedMode.authConfigCreation.optional]) {
      const value = values[field.name] ?? ''
      if (value.trim().length > 0) {
        credentials[field.name] = value
      }
    }

    await onSubmit({
      mode: selectedMode.mode,
      credentials,
    })
  }

  const optionalFields = selectedMode?.authConfigCreation.optional ?? []

  return (
    <Modal isOpen={isOpen} onClose={onClose} level={2}>
      <ModalContent maxWidth="lg">
        <div className="space-y-4 p-5 sm:p-6">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-muted">Custom auth</p>
            <h3 className="text-base font-semibold text-foreground">
              Configure {requirements?.displayName || toolkit}
            </h3>
            <p className="text-sm text-foreground-muted">
              This toolkit requires a custom auth config before continuing the connection flow.
            </p>
          </div>

          {selectedMode && authModes.length > 1 ? (
            <div className="space-y-1.5">
              <label htmlFor="custom-auth-mode" className="text-xs font-medium text-foreground-muted">
                Authentication mode
              </label>
              <select
                id="custom-auth-mode"
                value={selectedModeKey}
                onChange={(event) => setSelectedModeKey(event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-md border border-outline bg-editor px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-focused-content"
              >
                {authModes.map((mode) => (
                  <option key={getModeKey(mode)} value={getModeKey(mode)}>
                    {getModeLabel(mode)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {selectedMode ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                    Required fields
                  </p>
                  <span className="text-[11px] text-foreground-muted">{selectedMode.mode}</span>
                </div>

                <div className="space-y-3">
                  {selectedMode.authConfigCreation.required.length > 0 ? (
                    selectedMode.authConfigCreation.required.map(renderField)
                  ) : (
                    <p className="text-xs text-foreground-muted">No required auth config fields for this mode.</p>
                  )}
                </div>
              </div>

              {optionalFields.length > 0 ? (
                <div className="space-y-3 rounded-lg border border-outline/70 bg-canvas p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                      Optional fields
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowOptional((current) => !current)}
                      disabled={isSubmitting}
                    >
                      {showOptional ? 'Hide optional' : 'Show optional'}
                    </Button>
                  </div>

                  {showOptional ? <div className="space-y-3">{optionalFields.map(renderField)}</div> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-outline bg-canvas px-3 py-4 text-sm text-foreground-muted">
              No custom auth modes are available for this toolkit.
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="inverted"
              onClick={() => void handleSubmit()}
              isLoading={isSubmitting}
              disabled={!selectedMode}
            >
              Continue
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
}
