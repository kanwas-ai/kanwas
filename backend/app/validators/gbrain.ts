import vine from '@vinejs/vine'

const GBRAIN_LIMIT_REGEX = /^\d+$/
const GBRAIN_PAGE_PATH_REGEX = /^(?!\/)(?!.*(?:^|\/)\.\.)(?!.*\\)(?!.*\0).+\.md$/

export const searchGBrainValidator = vine.compile(
  vine.object({
    query: vine.string().trim().minLength(1).maxLength(200),
    limit: vine.string().trim().regex(GBRAIN_LIMIT_REGEX).optional(),
  })
)

export const readGBrainPageValidator = vine.compile(
  vine.object({
    path: vine.string().trim().minLength(1).maxLength(500).regex(GBRAIN_PAGE_PATH_REGEX),
  })
)
