import { describe, expect, it } from 'vitest'
import type { CustomAuthField } from '@/api/connections'
import {
  CUSTOM_AUTH_SELECT_CUSTOM_VALUE,
  getCustomAuthSelectState,
  getInitialCustomAuthFieldValue,
  resolveCustomAuthFieldControl,
} from '@/components/ui/ConnectionsModal/customAuthFieldUi'

function createField(overrides: Partial<CustomAuthField> = {}): CustomAuthField {
  return {
    name: 'subdomain',
    displayName: 'Subdomain',
    type: 'string',
    required: true,
    default: null,
    description: '',
    ...overrides,
  }
}

describe('custom auth field ui helpers', () => {
  it('returns the first option as the initial value for strict selects', () => {
    const field = createField({
      uiHints: {
        control: 'select',
        options: [
          { value: 'eu', label: 'EU' },
          { value: 'us', label: 'US' },
        ],
      },
    })

    expect(getInitialCustomAuthFieldValue(field)).toBe('eu')
  })

  it('uses default values before any select fallback', () => {
    const field = createField({
      default: 'us',
      uiHints: {
        control: 'select',
        options: [{ value: 'eu', label: 'EU' }],
      },
    })

    expect(getInitialCustomAuthFieldValue(field)).toBe('us')
  })

  it('uses preferred select default over toolkit default', () => {
    const field = createField({
      default: 'us',
      uiHints: {
        control: 'select',
        options: [
          { value: 'us.i', label: 'US public' },
          { value: 'eu.i', label: 'EU public' },
        ],
        allowCustomValue: true,
        preferredDefaultValue: 'us.i',
      },
    })

    expect(getInitialCustomAuthFieldValue(field)).toBe('us.i')
  })

  it('returns custom select state when allowCustomValue is enabled', () => {
    const field = createField({
      uiHints: {
        control: 'select',
        options: [
          { value: 'us', label: 'US' },
          { value: 'eu', label: 'EU' },
        ],
        allowCustomValue: true,
      },
    })

    const selectState = getCustomAuthSelectState(field, 'mycompany')
    expect(selectState).toMatchObject({
      allowCustomValue: true,
      isCustomValue: true,
      selectValue: CUSTOM_AUTH_SELECT_CUSTOM_VALUE,
    })
  })

  it('falls back to password control for sensitive fields without hints', () => {
    const field = createField({
      name: 'generic_api_key',
      displayName: 'API Key',
    })

    expect(resolveCustomAuthFieldControl(field, '')).toBe('password')
  })

  it('falls back to text control when select has no options and no custom mode', () => {
    const field = createField({
      uiHints: {
        control: 'select',
        options: [],
      },
    })

    expect(resolveCustomAuthFieldControl(field, '')).toBe('text')
  })
})
