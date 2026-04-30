import type { AuditFields, CanvasItem, MetadataAuditActor, MetadataAuditFields, NodeItem } from '../types.js'

const ACTOR_PATTERN = /^(user|agent):([^:\s]+)$/

export interface ParsedAuditActor {
  actor: string
  kind: 'user' | 'agent'
  id: string
}

export interface AuditIdentity {
  id: string | null
  name: string | null
  email: string | null
}

export interface MetadataAuditActorIdentity extends AuditIdentity {
  actor: string
}

export function normalizeAuditActor(actor: string | undefined | null): string | undefined {
  if (typeof actor !== 'string') return undefined
  const normalized = actor.trim()
  if (!ACTOR_PATTERN.test(normalized)) return undefined
  return normalized
}

export function isValidAuditActor(actor: string | undefined | null): actor is string {
  return normalizeAuditActor(actor) !== undefined
}

export function parseAuditActor(actor: string | undefined | null): ParsedAuditActor | null {
  const normalized = normalizeAuditActor(actor)
  if (!normalized) return null

  const match = normalized.match(ACTOR_PATTERN)
  if (!match) return null

  return {
    actor: normalized,
    kind: match[1] as 'user' | 'agent',
    id: match[2],
  }
}

export function stampAuditOnCreate(
  existing: AuditFields | undefined,
  actor: string | undefined,
  nowIso: string
): AuditFields {
  const normalizedActor = normalizeAuditActor(actor)
  const next: AuditFields = { ...(existing ?? {}) }

  if (!next.createdAt) next.createdAt = nowIso
  if (!next.createdBy && normalizedActor) next.createdBy = normalizedActor
  if (!next.updatedAt) next.updatedAt = nowIso
  if (!next.updatedBy && normalizedActor) next.updatedBy = normalizedActor

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

export function mergeAuditFields(existing: AuditFields | undefined, incoming: AuditFields | undefined): AuditFields {
  const base: AuditFields = { ...(incoming ?? {}) }

  if (existing?.createdAt) base.createdAt = existing.createdAt
  if (existing?.createdBy) base.createdBy = existing.createdBy

  return base
}

export function toMetadataAuditActorIdentity(
  actor: string | undefined,
  identity?: AuditIdentity | null
): MetadataAuditActor | undefined {
  const parsed = parseAuditActor(actor)
  if (!parsed) return undefined

  return {
    actor: parsed.actor,
    id: identity?.id ?? parsed.id,
    name: identity?.name ?? null,
    email: identity?.email ?? null,
  }
}

export function collectAuditActors(audit: AuditFields | undefined, actors: Set<string>): void {
  if (!audit) return
  if (typeof audit.createdBy === 'string') actors.add(audit.createdBy)
  if (typeof audit.updatedBy === 'string') actors.add(audit.updatedBy)
}

export async function resolveAuditIdentities(
  actors: Set<string>,
  resolver?: (actor: string) => Promise<AuditIdentity | null>
): Promise<Map<string, AuditIdentity | null>> {
  const resolved = new Map<string, AuditIdentity | null>()
  if (!resolver) return resolved

  await Promise.all(
    Array.from(actors).map(async (actor) => {
      const identity = await resolver(actor)
      resolved.set(actor, identity)
    })
  )

  return resolved
}

export function toMetadataAuditFields(
  audit: AuditFields | undefined,
  resolved: Map<string, AuditIdentity | null>
): MetadataAuditFields | undefined {
  if (!audit) return undefined

  const createdBy = toMetadataAuditActorIdentity(
    audit.createdBy,
    audit.createdBy ? resolved.get(audit.createdBy) : undefined
  )
  const updatedBy = toMetadataAuditActorIdentity(
    audit.updatedBy,
    audit.updatedBy ? resolved.get(audit.updatedBy) : undefined
  )

  const next: MetadataAuditFields = {
    ...(audit.createdAt ? { createdAt: audit.createdAt } : {}),
    ...(audit.updatedAt ? { updatedAt: audit.updatedAt } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(updatedBy ? { updatedBy } : {}),
  }

  return Object.keys(next).length > 0 ? next : undefined
}

export function getNodeAudit(nodeItem: NodeItem): AuditFields | undefined {
  return nodeItem.xynode.data?.audit
}

export function setNodeAudit(nodeItem: NodeItem, audit: AuditFields): void {
  nodeItem.xynode.data = {
    ...nodeItem.xynode.data,
    audit,
  }
}

export function getCanvasAudit(canvas: CanvasItem): AuditFields | undefined {
  return canvas.xynode.data?.audit
}

export function setCanvasAudit(canvas: CanvasItem, audit: AuditFields): void {
  canvas.xynode.data = {
    ...canvas.xynode.data,
    audit,
  }
}

export function stampCreateAuditOnNode(nodeItem: NodeItem, actor: string | undefined, nowIso: string): void {
  const next = stampAuditOnCreate(getNodeAudit(nodeItem), actor, nowIso)
  const merged = mergeAuditFields(getNodeAudit(nodeItem), next)
  setNodeAudit(nodeItem, merged)
}

export function stampCreateAuditOnCanvas(canvas: CanvasItem, actor: string | undefined, nowIso: string): void {
  const next = stampAuditOnCreate(getCanvasAudit(canvas), actor, nowIso)
  const merged = mergeAuditFields(getCanvasAudit(canvas), next)
  setCanvasAudit(canvas, merged)
}

export function touchAuditIfNodeUpdated(nodeItem: NodeItem, actor: string | undefined, nowIso: string): void {
  const next = touchAuditOnUpdate(getNodeAudit(nodeItem), actor, nowIso)
  const merged = mergeAuditFields(getNodeAudit(nodeItem), next)
  setNodeAudit(nodeItem, merged)
}

export function touchAuditIfCanvasUpdated(canvas: CanvasItem, actor: string | undefined, nowIso: string): void {
  const next = touchAuditOnUpdate(getCanvasAudit(canvas), actor, nowIso)
  const merged = mergeAuditFields(getCanvasAudit(canvas), next)
  setCanvasAudit(canvas, merged)
}
