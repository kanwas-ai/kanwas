import type { HttpContext } from '@adonisjs/core/http'
import { WorkspaceSeedFailedError } from '#services/workspace_service'

interface HandleWorkspaceSeedFailureOptions {
  logger?: HttpContext['logger']
  operation?: string
  message?: string
}

export function handleWorkspaceSeedFailure(
  error: unknown,
  response: HttpContext['response'],
  options: HandleWorkspaceSeedFailureOptions = {}
): boolean {
  if (!(error instanceof WorkspaceSeedFailedError)) {
    return false
  }

  if (options.logger) {
    options.logger.error(
      {
        operation: options.operation ?? 'workspace_seed_failed',
        error: error.message,
        cause: error.cause,
      },
      options.message ?? 'Workspace seed failed'
    )
  }

  response.serviceUnavailable({ error: error.message })
  return true
}
