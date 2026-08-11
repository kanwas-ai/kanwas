import vine, { BaseLiteralType, Vine, symbols } from '@vinejs/vine'
import { DateTime } from 'luxon'
import type { FieldContext, FieldOptions, Validation } from '@vinejs/vine/types'

const { SUBTYPE } = symbols

/**
 * Validation rule to validate a Luxon DateTime and convert it to a plain JS Date
 */
const isLuxonDateTime = vine.createRule((value: unknown, _, field: FieldContext) => {
  /**
   * Check if value is a DateTime instance
   */
  if (!DateTime.isDateTime(value)) {
    field.report('The {{ field }} field must be a Luxon DateTime object', 'luxonDateTime', field)
    return
  }

  /**
   * Validate that the DateTime is valid
   */
  if (!value.isValid) {
    field.report('The {{ field }} field must be a valid Luxon DateTime', 'luxonDateTime', field)
    return
  }

  /**
   * Convert Luxon DateTime to plain JS Date
   */
  field.mutate(value.toJSDate(), field)
})

/**
 * VineLuxonDateTime schema class
 * Accepts Luxon DateTime objects and outputs plain JS Date objects
 */
// @ts-expect-error - TypeScript cannot properly validate computed symbol properties
export class VineLuxonDateTime extends BaseLiteralType<DateTime, Date, Date> {
  [SUBTYPE] = 'luxonDateTime' as const

  constructor(options?: FieldOptions, validations?: Validation<any>[]) {
    super(options, validations || [isLuxonDateTime()])
  }

  clone() {
    return new VineLuxonDateTime(this.cloneOptions(), this.cloneValidations()) as this
  }
}

/**
 * Extend Vine with luxonDateTime method
 */
Vine.macro('luxonDateTime', function () {
  return new VineLuxonDateTime()
})

/**
 * TypeScript declaration for the new method
 */
declare module '@vinejs/vine' {
  interface Vine {
    luxonDateTime(): VineLuxonDateTime
  }
}
