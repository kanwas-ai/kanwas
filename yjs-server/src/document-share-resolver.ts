import type { DocumentShareSocketAccessResolveResult } from 'shared/document-share'
import type { OperationContext } from './operation-context.js'

export interface DocumentShareResolver {
  readonly enabled: boolean
  resolveSocketAccess(longHashId: string, context?: OperationContext): Promise<DocumentShareSocketAccessResolveResult>
}

export interface HttpDocumentShareResolverOptions {
  backendApiSecret: string
  backendUrl: string
}

export class HttpDocumentShareResolver implements DocumentShareResolver {
  readonly enabled = true

  constructor(private readonly options: HttpDocumentShareResolverOptions) {}

  async resolveSocketAccess(
    longHashId: string,
    context?: OperationContext
  ): Promise<DocumentShareSocketAccessResolveResult> {
    const response = await fetch(`${this.options.backendUrl}/shares/${encodeURIComponent(longHashId)}/socket-access`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.options.backendApiSecret}`,
        ...(context?.correlationId ? { 'x-correlation-id': context.correlationId } : {}),
      },
    })

    if (response.ok || response.status === 404 || response.status === 410) {
      return (await response.json()) as DocumentShareSocketAccessResolveResult
    }

    const responseBody = await response.text()
    throw new Error(
      `Document share socket access lookup failed with status ${response.status}${responseBody ? `: ${responseBody}` : ''}`
    )
  }
}

export class DisabledDocumentShareResolver implements DocumentShareResolver {
  readonly enabled = false

  async resolveSocketAccess(longHashId: string): Promise<DocumentShareSocketAccessResolveResult> {
    return {
      longHashId,
      active: false,
      revoked: false,
      status: 'not_found',
    }
  }
}
