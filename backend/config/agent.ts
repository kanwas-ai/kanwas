import env from '#start/env'

export default {
  anthropicApiKey: env.get('ANTHROPIC_API_KEY'),
  openaiApiKey: env.get('OPENAI_API_KEY'),
  openaiBaseUrl: env.get('OPENAI_BASE_URL'),
  parallelApiKey: env.get('PARALLEL_API_KEY'),
  assemblyaiApiKey: env.get('ASSEMBLYAI_API_KEY'),
  connectedExternalTools: {
    enabled: true,
  },
}
