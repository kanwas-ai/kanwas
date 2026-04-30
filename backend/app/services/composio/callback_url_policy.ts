import env from '#start/env'
import { InvalidConnectionCallbackUrlError } from './errors.js'

const CALLBACK_SUFFIX = '/connections/callback'
const DEFAULT_CALLBACK_ORIGINS = ['https://app.kanwas.ai', 'http://staging.kanwas.ai']
const DEV_CALLBACK_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]

function parseOrigin(value?: string): string | undefined {
  if (!value) {
    return undefined
  }

  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

function getAllowedCallbackOrigins(): Set<string> {
  const origins = new Set<string>(DEFAULT_CALLBACK_ORIGINS)

  const googleRedirectOrigin = parseOrigin(env.get('GOOGLE_REDIRECT_URI'))
  if (googleRedirectOrigin) {
    origins.add(googleRedirectOrigin)
  }

  if (env.get('NODE_ENV') !== 'production') {
    for (const origin of DEV_CALLBACK_ORIGINS) {
      origins.add(origin)
    }
  }

  return origins
}

export function validateConnectionCallbackUrl(callbackUrl: string): string {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(callbackUrl)
  } catch {
    throw new InvalidConnectionCallbackUrlError('Callback URL must be a valid absolute URL')
  }

  if (!parsedUrl.pathname.endsWith(CALLBACK_SUFFIX)) {
    throw new InvalidConnectionCallbackUrlError('Callback URL must point to the connections callback page')
  }

  const allowedOrigins = getAllowedCallbackOrigins()
  if (!allowedOrigins.has(parsedUrl.origin)) {
    throw new InvalidConnectionCallbackUrlError('Callback URL origin is not allowed')
  }

  return parsedUrl.toString()
}
