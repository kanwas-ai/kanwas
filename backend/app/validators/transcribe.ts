import vine from '@vinejs/vine'

export const transcribeValidator = vine.compile(
  vine.object({
    audio: vine.file({
      size: '25mb',
      extnames: ['webm', 'ogg', 'mp3', 'wav', 'm4a', 'mp4', 'mpeg', 'mpga'],
    }),
  })
)
