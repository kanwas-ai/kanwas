import type { CustomAuthField, CustomAuthFieldControl, CustomAuthFieldUiOption } from '@/api/connections'

const SENSITIVE_FIELD_PATTERN = /secret|token|password|private[_-]?key|api[_-]?key|generic_api_key/i

export const CUSTOM_AUTH_SELECT_CUSTOM_VALUE = '__kanwas_custom_value__'

function normalizeSelectOptions(options?: CustomAuthFieldUiOption[]): CustomAuthFieldUiOption[] {
  if (!Array.isArray(options)) {
    return []
  }

  const normalizedOptions: CustomAuthFieldUiOption[] = []
  const seenValues = new Set<string>()

  for (const option of options) {
    const value = typeof option?.value === 'string' ? option.value.trim() : ''
    if (!value || seenValues.has(value)) {
      continue
    }

    seenValues.add(value)
    const label = typeof option.label === 'string' && option.label.trim().length > 0 ? option.label.trim() : value
    const description =
      typeof option.description === 'string' && option.description.trim().length > 0
        ? option.description.trim()
        : undefined

    normalizedOptions.push({
      value,
      label,
      ...(description ? { description } : {}),
    })
  }

  return normalizedOptions
}

export function getCustomAuthFieldSelectOptions(field: CustomAuthField): CustomAuthFieldUiOption[] {
  return normalizeSelectOptions(field.uiHints?.options)
}

export function isSensitiveCustomAuthField(field: CustomAuthField): boolean {
  return SENSITIVE_FIELD_PATTERN.test(field.name) || SENSITIVE_FIELD_PATTERN.test(field.displayName)
}

export function shouldRenderTextAreaForCustomAuthField(field: CustomAuthField, value: string): boolean {
  if (field.name.toLowerCase() === 'scopes') {
    return true
  }

  if (field.name.toLowerCase().includes('private_key')) {
    return true
  }

  return value.length > 80
}

export function resolveCustomAuthFieldControl(field: CustomAuthField, value: string): CustomAuthFieldControl {
  const hintedControl = field.uiHints?.control
  if (hintedControl === 'select') {
    const options = getCustomAuthFieldSelectOptions(field)
    if (options.length > 0 || field.uiHints?.allowCustomValue === true) {
      return 'select'
    }

    return 'text'
  }

  if (hintedControl === 'textarea' || hintedControl === 'password' || hintedControl === 'text') {
    return hintedControl
  }

  if (shouldRenderTextAreaForCustomAuthField(field, value)) {
    return 'textarea'
  }

  return isSensitiveCustomAuthField(field) ? 'password' : 'text'
}

export function getInitialCustomAuthFieldValue(field: CustomAuthField): string {
  if (field.uiHints?.control === 'select') {
    const options = getCustomAuthFieldSelectOptions(field)
    const preferredDefaultValue =
      typeof field.uiHints.preferredDefaultValue === 'string' ? field.uiHints.preferredDefaultValue.trim() : ''

    if (
      preferredDefaultValue.length > 0 &&
      (field.uiHints.allowCustomValue === true || options.some((option) => option.value === preferredDefaultValue))
    ) {
      return preferredDefaultValue
    }
  }

  const defaultValue = typeof field.default === 'string' ? field.default : ''
  if (defaultValue.length > 0) {
    return defaultValue
  }

  if (field.uiHints?.control === 'select' && field.uiHints.allowCustomValue !== true) {
    const options = getCustomAuthFieldSelectOptions(field)
    return options[0]?.value ?? ''
  }

  return ''
}

export interface CustomAuthSelectState {
  options: CustomAuthFieldUiOption[]
  allowCustomValue: boolean
  selectValue: string
  isCustomValue: boolean
}

export function getCustomAuthSelectState(field: CustomAuthField, value: string): CustomAuthSelectState | null {
  if (resolveCustomAuthFieldControl(field, value) !== 'select') {
    return null
  }

  const options = getCustomAuthFieldSelectOptions(field)
  const allowCustomValue = field.uiHints?.allowCustomValue === true
  const hasMatchingOption = options.some((option) => option.value === value)

  if (hasMatchingOption) {
    return {
      options,
      allowCustomValue,
      selectValue: value,
      isCustomValue: false,
    }
  }

  if (allowCustomValue) {
    return {
      options,
      allowCustomValue,
      selectValue: CUSTOM_AUTH_SELECT_CUSTOM_VALUE,
      isCustomValue: true,
    }
  }

  return {
    options,
    allowCustomValue,
    selectValue: options[0]?.value ?? '',
    isCustomValue: false,
  }
}
