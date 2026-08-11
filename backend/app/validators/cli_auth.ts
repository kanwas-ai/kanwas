import vine from '@vinejs/vine'

export const cliAuthorizeValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(1),
  })
)

export const cliPollValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(1),
  })
)
