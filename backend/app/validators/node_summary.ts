import vine from '@vinejs/vine'

export const summarizeNodeValidator = vine.compile(
  vine.object({
    name: vine.string().trim(),
    content: vine.string(),
    emoji: vine.string().trim().nullable().optional(),
    summary: vine.string().trim().nullable().optional(),
  })
)
