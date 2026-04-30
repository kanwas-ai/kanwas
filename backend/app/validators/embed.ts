import vine from '@vinejs/vine'

export const embedBootstrapValidator = vine.compile(
  vine.object({
    templateId: vine.string().trim().minLength(1),
  })
)
