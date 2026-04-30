import vine from '@vinejs/vine'

export const initiateConnectionValidator = vine.compile(
  vine.object({
    toolkit: vine.string().trim().minLength(1),
    customAuth: vine
      .object({
        mode: vine.string().trim().minLength(1).optional(),
        credentials: vine.record(vine.any()).optional(),
      })
      .optional(),
    callbackUrl: vine
      .string()
      .trim()
      .url({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] }),
  })
)

export const toolkitsQueryValidator = vine.compile(
  vine.object({
    search: vine.string().trim().optional(),
    isConnected: vine
      .string()
      .trim()
      .regex(/^(true|false)$/i)
      .optional(),
  })
)

export const customAuthRequirementsQueryValidator = vine.compile(
  vine.object({
    toolkit: vine.string().trim().optional(),
  })
)
