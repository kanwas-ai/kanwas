import vine from '@vinejs/vine'
import {
  PERSON_NAME_HAS_NON_CONTROL_CHAR_REGEX,
  PERSON_NAME_MAX_LENGTH,
  PERSON_NAME_MIN_LENGTH,
} from '#services/person_name'

export function personNameValidator() {
  return vine
    .string()
    .trim()
    .minLength(PERSON_NAME_MIN_LENGTH)
    .maxLength(PERSON_NAME_MAX_LENGTH)
    .regex(PERSON_NAME_HAS_NON_CONTROL_CHAR_REGEX)
}
