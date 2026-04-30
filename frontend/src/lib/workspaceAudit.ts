import type { AuditFields, CanvasItem, NodeItem } from 'shared'
import { findCanvasById, findNodeById } from '@/lib/workspaceUtils'

const ACTOR_PATTERN = /^(user|agent):([^:\s]+)$/

export const AUDIT_TOUCH_DEBOUNCE_MS = 600

export interface BlockNoteAuditTransactionInput {
  docChanged: boolean
  isFocused: boolean
  isYSyncChangeOrigin: boolean
}

export interface ResolveIncomingAuditOptions {
  source: string
  details?: Record<string, unknown>
  fallbackActor?: string | undefined | null
}

export interface ResolvedIncomingAuditMetadata {
  actor: string | undefined
  timestamp: string
}

export function normalizeAuditActor(actor: string | undefined | null): string | undefined {
  if (typeof actor !== 'string') {
    return undefined
  }

  const normalized = actor.trim()
  if (!ACTOR_PATTERN.test(normalized)) {
    return undefined
  }

  return normalized
}

export function createUserAuditActor(userId: string | undefined | null): string | undefined {
  if (!userId) {
    return undefined
  }

  return normalizeAuditActor(`user:${userId}`)
}

export function resolveAuditActor(
  preferredActor: string | undefined | null,
  fallbackActor: string | undefined | null
): string | undefined {
  return normalizeAuditActor(preferredActor) ?? normalizeAuditActor(fallbackActor)
}

export function resolveAuditTimestamp(
  timestamp: string | undefined | null,
  nowIso: string = new Date().toISOString()
): string {
  if (typeof timestamp !== 'string') {
    return nowIso
  }

  const normalized = timestamp.trim()
  if (!normalized) {
    return nowIso
  }

  const parsed = Date.parse(normalized)
  if (Number.isNaN(parsed)) {
    return nowIso
  }

  return new Date(parsed).toISOString()
}

export function resolveIncomingAuditMetadata(
  actor: string | undefined | null,
  timestamp: string | undefined | null,
  options: ResolveIncomingAuditOptions
): ResolvedIncomingAuditMetadata {
  const resolvedActor = resolveAuditActor(actor, options.fallbackActor)
  if (!resolvedActor) {
    console.warn(`[${options.source}] Missing audit actor`, options.details ?? {})
  }

  return {
    actor: resolvedActor,
    timestamp: resolveAuditTimestamp(timestamp),
  }
}

export function shouldTouchAuditFromBlockNoteTransaction(input: BlockNoteAuditTransactionInput): boolean {
  if (!input.docChanged) {
    return false
  }

  if (!input.isFocused) {
    return false
  }

  return !input.isYSyncChangeOrigin
}

export function stampAuditOnCreate(
  existing: AuditFields | undefined,
  actor: string | undefined,
  nowIso: string
): AuditFields {
  const normalizedActor = normalizeAuditActor(actor)
  const next: AuditFields = { ...(existing ?? {}) }

  if (!next.createdAt) {
    next.createdAt = nowIso
  }

  if (!next.createdBy && normalizedActor) {
    next.createdBy = normalizedActor
  }

  if (!next.updatedAt) {
    next.updatedAt = nowIso
  }

  if (!next.updatedBy && normalizedActor) {
    next.updatedBy = normalizedActor
  }

  return next
}

export function touchAuditOnUpdate(
  existing: AuditFields | undefined,
  actor: string | undefined,
  nowIso: string
): AuditFields {
  const normalizedActor = normalizeAuditActor(actor)
  const next: AuditFields = { ...(existing ?? {}) }

  next.updatedAt = nowIso
  if (normalizedActor) {
    next.updatedBy = normalizedActor
  }

  return next
}

export function mergeAuditFields(existing: AuditFields | undefined, incoming: AuditFields): AuditFields {
  const merged: AuditFields = { ...incoming }

  if (existing?.createdAt) {
    merged.createdAt = existing.createdAt
  }

  if (existing?.createdBy) {
    merged.createdBy = existing.createdBy
  }

  return merged
}

function setNodeAudit(nodeItem: NodeItem, audit: AuditFields): void {
  nodeItem.xynode.data = {
    ...nodeItem.xynode.data,
    audit,
  }
}

function setCanvasAudit(canvas: CanvasItem, audit: AuditFields): void {
  canvas.xynode.data = {
    ...canvas.xynode.data,
    audit,
  }
}

function getNodeAudit(nodeItem: NodeItem): AuditFields | undefined {
  return nodeItem.xynode.data?.audit
}

function getCanvasAudit(canvas: CanvasItem): AuditFields | undefined {
  return canvas.xynode.data?.audit
}

export function stampCreateAuditOnNode(nodeItem: NodeItem, actor: string | undefined, nowIso: string): void {
  const next = stampAuditOnCreate(getNodeAudit(nodeItem), actor, nowIso)
  setNodeAudit(nodeItem, mergeAuditFields(getNodeAudit(nodeItem), next))
}

export function stampCreateAuditOnCanvas(canvas: CanvasItem, actor: string | undefined, nowIso: string): void {
  const next = stampAuditOnCreate(getCanvasAudit(canvas), actor, nowIso)
  setCanvasAudit(canvas, mergeAuditFields(getCanvasAudit(canvas), next))
}

export function touchAuditOnNode(nodeItem: NodeItem, actor: string | undefined, nowIso: string): void {
  const next = touchAuditOnUpdate(getNodeAudit(nodeItem), actor, nowIso)
  setNodeAudit(nodeItem, mergeAuditFields(getNodeAudit(nodeItem), next))
}

export function touchAuditOnCanvas(canvas: CanvasItem, actor: string | undefined, nowIso: string): void {
  const next = touchAuditOnUpdate(getCanvasAudit(canvas), actor, nowIso)
  setCanvasAudit(canvas, mergeAuditFields(getCanvasAudit(canvas), next))
}

export function appendNodeWithCreateAudit(
  targetCanvas: CanvasItem,
  nodeItem: NodeItem,
  actor: string | undefined,
  nowIso: string
): void {
  stampCreateAuditOnNode(nodeItem, actor, nowIso)
  touchAuditOnCanvas(targetCanvas, actor, nowIso)
  targetCanvas.items.push(nodeItem)
}

export function appendCanvasWithCreateAudit(
  parentCanvas: CanvasItem,
  canvasItem: CanvasItem,
  actor: string | undefined,
  nowIso: string
): void {
  stampCreateAuditOnCanvas(canvasItem, actor, nowIso)
  touchAuditOnCanvas(parentCanvas, actor, nowIso)
  parentCanvas.items.push(canvasItem)
}

export function touchNodeAndOwnerCanvasAudit(
  root: CanvasItem,
  nodeId: string,
  actor: string | undefined,
  nowIso: string
): boolean {
  const located = findNodeById(root, nodeId)
  if (!located) {
    return false
  }

  touchAuditOnNode(located.node, actor, nowIso)

  const canvas = findCanvasById(root, located.canvasId)
  if (canvas) {
    touchAuditOnCanvas(canvas, actor, nowIso)
  }

  return true
}
