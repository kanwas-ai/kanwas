import type { PublicDocumentShareResolveResult } from 'shared/document-share'
import { publicFetch } from './publicClient'

export async function resolvePublicDocumentShare(longHashId: string): Promise<PublicDocumentShareResolveResult> {
  const response = await publicFetch(`/shares/${encodeURIComponent(longHashId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (response.ok || response.status === 404 || response.status === 410) {
    return (await response.json()) as PublicDocumentShareResolveResult
  }

  const responseBody = await response.text()
  throw new Error(
    `Failed to resolve public document share (status ${response.status})${responseBody ? `: ${responseBody}` : ''}`
  )
}
