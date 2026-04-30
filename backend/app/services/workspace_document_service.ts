import { inject } from '@adonisjs/core'
import {
  connectToWorkspace,
  once,
  type WorkspaceConnection,
  type WorkspaceDocument,
  type WorkspaceSnapshotBundle,
} from 'shared'
import { createWorkspaceSnapshotBundle } from 'shared/server'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { getYjsServerConnectionConfig } from '#services/yjs_server_connection_config'
import YjsSocketTokenService from '#services/yjs_socket_token_service'

const BACKEND_SYSTEM_USER_ID = 'backend:system'

export type LiveWorkspaceDocumentErrorCode = 'YJS_SERVER_CONNECTION_FAILED' | 'YJS_SERVER_SYNC_TIMEOUT'

export class LiveWorkspaceDocumentError extends Error {
  declare cause?: unknown
  readonly retryable = true

  constructor(
    public readonly code: LiveWorkspaceDocumentErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message)
    this.name = 'LiveWorkspaceDocumentError'
    this.cause = options?.cause
  }
}

export interface GetWorkspaceDocumentOptions {
  timeoutMs?: number
  yDoc?: Y.Doc
  correlationId?: string
  /** User id used for auditing backend-initiated socket connections. */
  actorUserId?: string
}

export interface WorkspaceDocumentConnection {
  proxy: WorkspaceDocument
  yDoc: Y.Doc
  provider: WorkspaceConnection['provider']
  contentStore: WorkspaceConnection['contentStore']
  cleanup: () => void
}

type WorkspaceConnector = typeof connectToWorkspace

function mapConnectionError(error: unknown): LiveWorkspaceDocumentError {
  const message = error instanceof Error ? error.message : String(error)

  if (/timeout/i.test(message)) {
    return new LiveWorkspaceDocumentError('YJS_SERVER_SYNC_TIMEOUT', `Yjs server sync timeout: ${message}`, {
      cause: error,
    })
  }

  return new LiveWorkspaceDocumentError('YJS_SERVER_CONNECTION_FAILED', `Yjs server connection failed: ${message}`, {
    cause: error,
  })
}

export function isLiveWorkspaceDocumentError(error: unknown): error is LiveWorkspaceDocumentError {
  return error instanceof LiveWorkspaceDocumentError
}

@inject()
export default class WorkspaceDocumentService {
  private connector: WorkspaceConnector = connectToWorkspace

  constructor(private readonly tokenService: YjsSocketTokenService) {}

  /** Test seam: swap the underlying connector. Not used in production code. */
  setConnector(connector: WorkspaceConnector): void {
    this.connector = connector
  }

  async getWorkspaceDocument(
    workspaceId: string,
    options: GetWorkspaceDocumentOptions = {}
  ): Promise<WorkspaceDocumentConnection> {
    const config = getYjsServerConnectionConfig()
    const timeout = options.timeoutMs ?? config.syncTimeoutMs
    const actorUserId = options.actorUserId ?? BACKEND_SYSTEM_USER_ID

    try {
      const connection = await this.connector({
        host: config.host,
        workspaceId,
        protocol: config.protocol,
        timeout,
        WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
        correlationId: options.correlationId,
        yDoc: options.yDoc,
        socketToken: () => this.tokenService.mint({ workspaceId, userId: actorUserId, mode: 'editable' }).token,
      })

      const cleanup = once(() => {
        connection.disconnect()
      })

      return {
        proxy: connection.proxy,
        yDoc: connection.yDoc,
        provider: connection.provider,
        contentStore: connection.contentStore,
        cleanup,
      }
    } catch (error) {
      throw mapConnectionError(error)
    }
  }

  async withWorkspaceDocument<T>(
    workspaceId: string,
    handler: (doc: WorkspaceDocumentConnection) => Promise<T> | T,
    options: GetWorkspaceDocumentOptions = {}
  ): Promise<T> {
    const connection = await this.getWorkspaceDocument(workspaceId, options)

    try {
      return await handler(connection)
    } finally {
      connection.cleanup()
    }
  }

  async readSnapshotBundle(
    workspaceId: string,
    options: GetWorkspaceDocumentOptions = {}
  ): Promise<WorkspaceSnapshotBundle> {
    return this.withWorkspaceDocument(
      workspaceId,
      async ({ yDoc }) => {
        return createWorkspaceSnapshotBundle(yDoc)
      },
      options
    )
  }
}
