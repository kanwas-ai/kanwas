import env from '#start/env'
import { getYjsServerConnectionConfig } from '#services/yjs_server_connection_config'
import type { WorkspaceSnapshotBundle } from 'shared'

export class YjsServerDurabilityError extends Error {
  declare cause?: unknown
  readonly retryable = true

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'YjsServerDurabilityError'
    this.cause = options?.cause
  }
}

export default class YjsServerService {
  private baseUrl: string
  private apiSecret: string

  constructor() {
    const { host, httpProtocol } = getYjsServerConnectionConfig()
    this.baseUrl = `${httpProtocol}://${host}`
    this.apiSecret = env.get('API_SECRET')
  }

  private async mutateDocument(
    workspaceId: string,
    document: WorkspaceSnapshotBundle,
    reason: string,
    notifyBackend: boolean,
    correlationId?: string
  ): Promise<void> {
    const url = new URL(`${this.baseUrl}/documents/${workspaceId}/replace`)
    url.searchParams.set('reason', reason)
    url.searchParams.set('notifyBackend', notifyBackend ? 'true' : 'false')

    let response: Response

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiSecret}`,
          'Content-Type': 'application/json',
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
        body: JSON.stringify(document),
      })
    } catch (error) {
      throw new YjsServerDurabilityError(`Failed to reach Yjs server for workspace ${workspaceId}`, {
        cause: error,
      })
    }

    if (!response.ok) {
      const text = await response.text()
      throw new YjsServerDurabilityError(
        `Yjs server durability acknowledgement failed for workspace ${workspaceId}: ${response.status} ${text}`
      )
    }
  }

  async replaceDocument(
    workspaceId: string,
    document: WorkspaceSnapshotBundle,
    options: { reason?: string; notifyBackend?: boolean; correlationId?: string } = {}
  ): Promise<void> {
    await this.mutateDocument(
      workspaceId,
      document,
      options.reason ?? 'replace',
      options.notifyBackend ?? true,
      options.correlationId
    )
  }
}
