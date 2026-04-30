import vine from '@vinejs/vine'

export const waitlistValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255),
    email: vine.string().email(),
    companyUrl: vine.string().url().maxLength(2048).optional(),
    role: vine.string().trim().maxLength(255).optional(),
    numberOfPms: vine.string().trim().maxLength(50).optional(),
  })
)
