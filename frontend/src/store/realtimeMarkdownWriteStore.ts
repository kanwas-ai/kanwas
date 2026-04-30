import { useSyncExternalStore } from 'react'

export const REALTIME_MD_WRITE_TICK_MS = 80

type RealtimeMarkdownWriteStatus = 'executing' | 'completed' | 'failed'

export interface RealtimeMarkdownWriteSource {
  toolCallId: string
  path: string
  animationKey: string
  markdownBody: string
  minimumVisibleMs?: number
  showDetachedPreview?: boolean
  status: RealtimeMarkdownWriteStatus
  nodeId?: string
  canvasId?: string
}

export interface RealtimeMarkdownWriteNodeState {
  toolCallId: string
  path: string
  animationKey: string
  markdownBody: string
  visibleMarkdown: string
  status: RealtimeMarkdownWriteStatus
  nodeId: string
  canvasId?: string
}

type RealtimeMarkdownWriteOperation = {
  toolCallId: string
  path: string
  animationKey: string
  markdownBody: string
  minimumVisibleMs: number
  showDetachedPreview: boolean
  visibleCharacters: number
  status: RealtimeMarkdownWriteStatus
  startedAt: number
  animationStartedAt?: number
  lastSeenAt: number
  missingSince?: number
  nodeId?: string
  canvasId?: string
  initialFingerprint?: string
  latestFingerprint?: string
  completedAt?: number
}

const CHARACTERS_PER_SECOND = 220
const MIN_INTRO_MS = 320
const COMPLETION_GRACE_MS = 750
const SOURCE_MISSING_TIMEOUT_MS = 1_500
const PATH_BIND_TIMEOUT_MS = 20_000

const operations = new Map<string, RealtimeMarkdownWriteOperation>()
const dismissedToolCallIds = new Set<string>()
const listeners = new Set<() => void>()
const nodeStateSnapshots = new Map<string, RealtimeMarkdownWriteNodeState | null>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function cloneOperation(operation: RealtimeMarkdownWriteOperation): RealtimeMarkdownWriteOperation {
  return { ...operation }
}

function areOperationsEquivalent(left: RealtimeMarkdownWriteOperation, right: RealtimeMarkdownWriteOperation): boolean {
  return (
    left.toolCallId === right.toolCallId &&
    left.path === right.path &&
    left.animationKey === right.animationKey &&
    left.markdownBody === right.markdownBody &&
    left.minimumVisibleMs === right.minimumVisibleMs &&
    left.showDetachedPreview === right.showDetachedPreview &&
    left.visibleCharacters === right.visibleCharacters &&
    left.status === right.status &&
    left.startedAt === right.startedAt &&
    left.animationStartedAt === right.animationStartedAt &&
    left.lastSeenAt === right.lastSeenAt &&
    left.missingSince === right.missingSince &&
    left.nodeId === right.nodeId &&
    left.canvasId === right.canvasId &&
    left.initialFingerprint === right.initialFingerprint &&
    left.latestFingerprint === right.latestFingerprint &&
    left.completedAt === right.completedAt
  )
}

function getMinimumVisibleMs(source: RealtimeMarkdownWriteSource): number {
  return Math.max(0, source.minimumVisibleMs ?? 0)
}

function hasSatisfiedMinimumVisibleDuration(operation: RealtimeMarkdownWriteOperation, now: number): boolean {
  const visibleSince = operation.animationStartedAt ?? operation.startedAt
  return now - visibleSince >= operation.minimumVisibleMs
}

function updateOperationVisibility(operation: RealtimeMarkdownWriteOperation, now: number): boolean {
  if (operation.animationStartedAt === undefined) {
    return false
  }

  const nextVisibleCharacters = Math.min(
    operation.markdownBody.length,
    Math.floor(((now - operation.animationStartedAt) * CHARACTERS_PER_SECOND) / 1_000)
  )

  if (nextVisibleCharacters === operation.visibleCharacters) {
    return false
  }

  operation.visibleCharacters = nextVisibleCharacters
  return true
}

function isAnimationComplete(operation: RealtimeMarkdownWriteOperation, now: number): boolean {
  if (operation.animationStartedAt === undefined) {
    return false
  }

  if (now - operation.animationStartedAt < MIN_INTRO_MS) {
    return false
  }

  return operation.visibleCharacters >= operation.markdownBody.length
}

function isCanonicalReady(operation: RealtimeMarkdownWriteOperation, now: number): boolean {
  if (operation.status !== 'completed') {
    return false
  }

  if (!operation.nodeId) {
    return false
  }

  if (operation.markdownBody.length === 0) {
    return true
  }

  if (
    operation.initialFingerprint !== undefined &&
    operation.latestFingerprint !== undefined &&
    operation.latestFingerprint !== operation.initialFingerprint
  ) {
    return true
  }

  return operation.completedAt !== undefined && now - operation.completedAt >= COMPLETION_GRACE_MS
}

function markOperationMissing(operation: RealtimeMarkdownWriteOperation, now: number): boolean {
  if (operation.missingSince !== undefined) {
    return false
  }

  operation.missingSince = now
  return true
}

function getLatestNodeOperation(
  nodeId: string,
  predicate?: (operation: RealtimeMarkdownWriteOperation) => boolean
): RealtimeMarkdownWriteOperation | null {
  let latest: RealtimeMarkdownWriteOperation | null = null

  for (const operation of operations.values()) {
    if (operation.nodeId !== nodeId) {
      continue
    }

    if (predicate && !predicate(operation)) {
      continue
    }

    if (!latest || operation.startedAt > latest.startedAt) {
      latest = operation
    }
  }

  return latest
}

export function subscribeRealtimeMarkdownWrites(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function hasRealtimeMarkdownWriteOperation(toolCallId: string): boolean {
  return operations.has(toolCallId)
}

export function hasDetachedRealtimeMarkdownWriteOperation(toolCallId: string): boolean {
  return operations.get(toolCallId)?.showDetachedPreview === true
}

export function syncRealtimeMarkdownWriteSources(sources: RealtimeMarkdownWriteSource[], now = Date.now()): void {
  const nextSourceIds = new Set(sources.map((source) => source.toolCallId))
  let changed = false

  for (const source of sources) {
    if (dismissedToolCallIds.has(source.toolCallId)) {
      continue
    }

    const existing = operations.get(source.toolCallId)
    const next = existing
      ? cloneOperation(existing)
      : {
          toolCallId: source.toolCallId,
          path: source.path,
          animationKey: source.animationKey,
          markdownBody: source.markdownBody,
          minimumVisibleMs: getMinimumVisibleMs(source),
          showDetachedPreview: source.showDetachedPreview === true,
          visibleCharacters: 0,
          status: source.status,
          startedAt: now,
          animationStartedAt: source.nodeId ? now : undefined,
          lastSeenAt: now,
        }

    next.path = source.path
    next.animationKey = source.animationKey
    next.markdownBody = source.markdownBody
    next.minimumVisibleMs = getMinimumVisibleMs(source)
    next.showDetachedPreview = source.showDetachedPreview === true
    next.status = source.status
    next.lastSeenAt = now
    next.missingSince = undefined

    if (source.status === 'completed' && next.completedAt === undefined) {
      next.completedAt = now
    }

    if (source.nodeId) {
      if (existing?.nodeId && existing.nodeId !== source.nodeId) {
        operations.delete(source.toolCallId)
        dismissedToolCallIds.add(source.toolCallId)
        changed = true
        continue
      }

      if (next.nodeId !== source.nodeId) {
        next.nodeId = source.nodeId
        next.canvasId = source.canvasId
        next.animationStartedAt ??= now
        next.initialFingerprint = undefined
        next.latestFingerprint = undefined
      } else {
        next.canvasId = source.canvasId
      }
    }

    if (!existing || !areOperationsEquivalent(existing, next)) {
      operations.set(source.toolCallId, next)
      changed = true
    }
  }

  for (const [toolCallId, operation] of operations) {
    if (nextSourceIds.has(toolCallId)) {
      continue
    }

    changed = markOperationMissing(operation, now) || changed
  }

  for (const toolCallId of dismissedToolCallIds) {
    if (!nextSourceIds.has(toolCallId)) {
      dismissedToolCallIds.delete(toolCallId)
    }
  }

  if (changed) {
    emit()
  }
}

export function tickRealtimeMarkdownWrites(now = Date.now()): void {
  let changed = false

  for (const [toolCallId, operation] of operations) {
    if (
      operation.missingSince !== undefined &&
      now - operation.missingSince >= SOURCE_MISSING_TIMEOUT_MS &&
      hasSatisfiedMinimumVisibleDuration(operation, now)
    ) {
      operations.delete(toolCallId)
      changed = true
      continue
    }

    if (!operation.nodeId && now - operation.startedAt >= PATH_BIND_TIMEOUT_MS) {
      operations.delete(toolCallId)
      dismissedToolCallIds.add(toolCallId)
      changed = true
      continue
    }

    if (operation.status === 'failed') {
      operations.delete(toolCallId)
      changed = true
      continue
    }

    changed = updateOperationVisibility(operation, now) || changed

    if (
      isAnimationComplete(operation, now) &&
      isCanonicalReady(operation, now) &&
      hasSatisfiedMinimumVisibleDuration(operation, now)
    ) {
      operations.delete(toolCallId)
      changed = true
    }
  }

  if (changed) {
    emit()
  }
}

export function clearRealtimeMarkdownWrites(): void {
  if (operations.size === 0 && dismissedToolCallIds.size === 0 && nodeStateSnapshots.size === 0) {
    return
  }

  operations.clear()
  dismissedToolCallIds.clear()
  nodeStateSnapshots.clear()
  emit()
}

function getRealtimeMarkdownWriteNodeState(nodeId: string): RealtimeMarkdownWriteNodeState | null {
  const operation = getLatestNodeOperation(nodeId, (candidate) => candidate.showDetachedPreview)
  const nextState =
    !operation || !operation.nodeId
      ? null
      : {
          toolCallId: operation.toolCallId,
          path: operation.path,
          animationKey: operation.animationKey,
          markdownBody: operation.markdownBody,
          visibleMarkdown: operation.markdownBody.slice(0, operation.visibleCharacters),
          status: operation.status,
          nodeId: operation.nodeId,
          canvasId: operation.canvasId,
        }

  const previousState = nodeStateSnapshots.get(nodeId)
  if (areNodeStatesEquivalent(previousState, nextState)) {
    return previousState ?? null
  }

  nodeStateSnapshots.set(nodeId, nextState)
  return nextState
}

export function useRealtimeMarkdownWriteNodeState(nodeId: string): RealtimeMarkdownWriteNodeState | null {
  return useSyncExternalStore(
    subscribeRealtimeMarkdownWrites,
    () => getRealtimeMarkdownWriteNodeState(nodeId),
    () => getRealtimeMarkdownWriteNodeState(nodeId)
  )
}

function isRealtimeMarkdownWriteActive(nodeId: string): boolean {
  return getLatestNodeOperation(nodeId) !== null
}

export function useIsRealtimeMarkdownWriteActive(nodeId: string): boolean {
  return useSyncExternalStore(
    subscribeRealtimeMarkdownWrites,
    () => isRealtimeMarkdownWriteActive(nodeId),
    () => isRealtimeMarkdownWriteActive(nodeId)
  )
}

function areNodeStatesEquivalent(
  left: RealtimeMarkdownWriteNodeState | null | undefined,
  right: RealtimeMarkdownWriteNodeState | null
): boolean {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return (
    left.toolCallId === right.toolCallId &&
    left.path === right.path &&
    left.animationKey === right.animationKey &&
    left.markdownBody === right.markdownBody &&
    left.visibleMarkdown === right.visibleMarkdown &&
    left.status === right.status &&
    left.nodeId === right.nodeId &&
    left.canvasId === right.canvasId
  )
}
