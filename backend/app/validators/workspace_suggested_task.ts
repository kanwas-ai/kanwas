import vine from '@vinejs/vine'
import './custom_types.js'

const WorkspaceSuggestedTaskSchemaNode = vine.object({
  id: vine.string(),
  emoji: vine.string(),
  headline: vine.string(),
  description: vine.string(),
  prompt: vine.string().maxLength(2000),
  source: vine.string().optional(),
})

export const WorkspaceSuggestedTaskSchema = vine.compile(WorkspaceSuggestedTaskSchemaNode)

export const WorkspaceSuggestedTaskStateSchema = vine.compile(
  vine.object({
    isLoading: vine.boolean(),
    tasks: vine.array(WorkspaceSuggestedTaskSchemaNode),
    generatedAt: vine.luxonDateTime().nullable(),
    error: vine.string().nullable(),
  })
)
