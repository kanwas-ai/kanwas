import type { HttpContext } from '@adonisjs/core/http'
import { transcribeValidator } from '#validators/transcribe'
import env from '#start/env'
import { readFile } from 'node:fs/promises'

export default class TranscribeController {
  async transcribe({ request, response }: HttpContext) {
    const data = await request.validateUsing(transcribeValidator)
    const file = data.audio

    const apiKey = env.get('GROQ_API_KEY')
    if (!apiKey) {
      return response.serviceUnavailable({ error: 'Voice transcription is not configured' })
    }

    if (!file.tmpPath) {
      return response.badRequest({ error: 'Audio file upload failed' })
    }

    const buffer = await readFile(file.tmpPath)

    const formData = new FormData()
    formData.append('file', new Blob([buffer]), `audio.${file.extname || 'webm'}`)
    formData.append('model', 'whisper-large-v3-turbo')
    formData.append('response_format', 'json')

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    })

    if (!groqResponse.ok) {
      const error = await groqResponse.text()
      return response.status(groqResponse.status).json({ error: `Transcription failed: ${error}` })
    }

    const result = (await groqResponse.json()) as { text: string }
    return response.ok({ text: result.text })
  }
}
