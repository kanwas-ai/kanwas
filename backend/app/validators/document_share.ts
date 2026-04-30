import vine from '@vinejs/vine'
import './custom_types.js'

export const documentShareParamsValidator = vine.compile(
  vine.object({
    noteId: vine.string().uuid(),
  })
)

export const createDocumentShareValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255),
    accessMode: vine.enum(['readonly', 'editable'] as const),
  })
)

export const updateDocumentShareValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255),
    accessMode: vine.enum(['readonly', 'editable'] as const),
  })
)

export const publicDocumentShareParamsValidator = vine.compile(
  vine.object({
    longHashId: vine.string().trim().minLength(16),
  })
)
