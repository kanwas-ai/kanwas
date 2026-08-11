import { getOrCreateCorrelationId, setCorrelationId } from '@/lib/correlation-id'

export const publicApiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3333'

export async function publicFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('x-correlation-id', getOrCreateCorrelationId())

  const response = await fetch(new URL(path, publicApiBaseUrl), {
    ...init,
    cache: 'no-store',
    headers,
  })

  const correlationId = response.headers.get('x-correlation-id')
  if (correlationId) {
    setCorrelationId(correlationId)
  }

  return response
}
