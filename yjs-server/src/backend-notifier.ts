import { getErrorLogContext } from './error-utils.js'
import type { Logger } from './logger.js'
import { getContextLogger, getContextSentryExtra, type OperationContext } from './operation-context.js'
import type { PersistenceStage } from './protocol.js'
import { captureException } from './sentry.js'

export interface BackendNotifier {
  notifyDocumentUpdated(workspaceId: string, stage: PersistenceStage, context?: OperationContext): Promise<boolean>
}

export interface HttpBackendNotifierOptions {
  backendUrl: string
  backendApiSecret: string
  logger: Logger
}

export class HttpBackendNotifier implements BackendNotifier {
  constructor(private readonly options: HttpBackendNotifierOptions) {}

  async notifyDocumentUpdated(
    workspaceId: string,
    stage: PersistenceStage,
    context?: OperationContext
  ): Promise<boolean> {
    const log = getContextLogger(this.options.logger, context)
    const source = `yjs-server:${stage}`
    const maxRetries = stage === 'save' ? 3 : 1
    const retryDelayMs = stage === 'save' ? 500 : 250
    let lastError: Error | null = null
    let lastStatus: number | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.options.backendUrl}/workspaces/${workspaceId}/document/updated`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.options.backendApiSecret}`,
            'Content-Type': 'application/json',
            ...(context?.correlationId ? { 'x-correlation-id': context.correlationId } : {}),
          },
          body: JSON.stringify({ source }),
        })

        if (response.ok) {
          if (attempt > 1) {
            log.info(
              {
                attempt,
                backendUrl: this.options.backendUrl,
                maxRetries,
                stage,
                status: response.status,
                workspaceId,
              },
              'Backend notification succeeded after retry'
            )
          } else {
            log.debug(
              {
                backendUrl: this.options.backendUrl,
                stage,
                status: response.status,
                workspaceId,
              },
              'Backend notification succeeded'
            )
          }
          return true
        }

        if (response.status >= 400 && response.status < 500) {
          const responseBody = await response.text()
          log.error(
            {
              attempt,
              backendUrl: this.options.backendUrl,
              maxRetries,
              responseBody,
              stage,
              status: response.status,
              workspaceId,
            },
            'Backend notification failed with non-retryable response'
          )
          return false
        }

        lastStatus = response.status
        lastError = new Error(`Backend notification failed with status ${response.status}`)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        lastStatus = null
      }

      if (attempt < maxRetries) {
        log.warn(
          {
            ...getErrorLogContext(lastError),
            attempt,
            backendUrl: this.options.backendUrl,
            maxRetries,
            nextRetryDelayMs: retryDelayMs * attempt,
            stage,
            status: lastStatus,
            workspaceId,
          },
          'Backend notification attempt failed, retrying'
        )
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
      }
    }

    log.error(
      {
        ...getErrorLogContext(lastError),
        attempt: maxRetries,
        backendUrl: this.options.backendUrl,
        maxRetries,
        stage,
        status: lastStatus,
        workspaceId,
      },
      'Backend notification failed after retries'
    )
    captureException(lastError, {
      ...getContextSentryExtra(context),
      backendUrl: this.options.backendUrl,
      maxRetries,
      notificationStage: stage,
      stage: 'backend_notify',
      status: lastStatus,
      workspaceId,
    })

    return false
  }
}

export class NoopBackendNotifier implements BackendNotifier {
  async notifyDocumentUpdated(): Promise<boolean> {
    return true
  }
}
