import type { IncomingMessage } from 'node:http'
import type { Socket } from 'socket.io'
import { bindLoggerContext, type Logger } from './logger.js'

export interface OperationContext {
  correlationId?: string
  logger?: Logger
}

export function getContextLogger(baseLogger: Logger, context?: OperationContext): Logger {
  if (!context) {
    return baseLogger
  }

  if (context.logger) {
    return context.logger
  }

  if (context.correlationId) {
    return bindLoggerContext(baseLogger, { correlationId: context.correlationId })
  }

  return baseLogger
}

export function getContextSentryExtra(context?: OperationContext): Record<string, unknown> {
  return context?.correlationId ? { correlationId: context.correlationId } : {}
}

export function createHttpOperationContext(baseLogger: Logger, request: IncomingMessage): OperationContext {
  const correlationId = normalizeCorrelationId(request.headers['x-correlation-id'])

  return {
    correlationId,
    logger: correlationId ? bindLoggerContext(baseLogger, { correlationId }) : baseLogger,
  }
}

export function createSocketOperationContext(baseLogger: Logger, socket: Socket): OperationContext {
  const correlationId =
    normalizeCorrelationId(socket.handshake.auth.correlationId) ??
    normalizeCorrelationId(socket.handshake.query.correlationId) ??
    normalizeCorrelationId(socket.handshake.headers['x-correlation-id'])

  return {
    correlationId,
    logger: correlationId ? bindLoggerContext(baseLogger, { correlationId }) : baseLogger,
  }
}

function normalizeCorrelationId(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return normalizeCorrelationId(value[0])
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
