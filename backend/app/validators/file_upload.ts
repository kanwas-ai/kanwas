import vine from '@vinejs/vine'
import { SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_FILE_EXTENSIONS, SUPPORTED_AUDIO_EXTENSIONS } from 'shared/constants'

const ALL_SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_FILE_EXTENSIONS,
  ...SUPPORTED_AUDIO_EXTENSIONS,
]

export const fileUploadValidator = vine.compile(
  vine.object({
    file: vine.file({
      size: '5mb',
      extnames: ALL_SUPPORTED_EXTENSIONS as unknown as string[],
    }),
    canvas_id: vine.string().minLength(1),
    filename: vine.string().minLength(1).maxLength(255),
  })
)
