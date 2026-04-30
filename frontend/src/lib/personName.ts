export const PERSON_NAME_MIN_LENGTH = 2
export const PERSON_NAME_MAX_LENGTH = 80
export const PERSON_NAME_HAS_NON_CONTROL_CHAR_REGEX = /[\P{C}]/u

export function normalizePersonName(value: string): string {
  return value.trim()
}

export function validatePersonName(value: string): string | null {
  const normalized = normalizePersonName(value)

  if (!normalized) {
    return 'Name is required.'
  }

  if (normalized.length < PERSON_NAME_MIN_LENGTH) {
    return `Name must be at least ${PERSON_NAME_MIN_LENGTH} characters.`
  }

  if (normalized.length > PERSON_NAME_MAX_LENGTH) {
    return `Name must be ${PERSON_NAME_MAX_LENGTH} characters or fewer.`
  }

  if (!PERSON_NAME_HAS_NON_CONTROL_CHAR_REGEX.test(normalized)) {
    return 'Name contains invalid characters.'
  }

  return null
}
