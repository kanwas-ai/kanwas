import vine from '@vinejs/vine'

export const linkMetadataValidator = vine.compile(
  vine.object({
    url: vine.string().url(),
    workspaceId: vine.string().uuid(),
    canvasId: vine.string().minLength(1),
  })
)
