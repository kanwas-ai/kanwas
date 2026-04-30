import vine from '@vinejs/vine'

export const fetchSlackMessageValidator = vine.compile(
  vine.object({
    permalink: vine.string().trim().url(),
  })
)
