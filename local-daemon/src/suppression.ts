// Single-writer echo cancellation, shared by the live orchestrator (folder→yDoc)
// and the flusher (yDoc→folder).
//
// The daemon is the only process writing to the folder on behalf of the yDoc, so
// it can cancel its OWN writes precisely: before writing a file it registers the
// exact bytes (or, for a removal, the path); when the watcher reports that change
// back the orchestrator consumes the registration and drops the event. Genuine
// external changes (agent, git, IDE) carry different bytes / unregistered paths
// and flow through normally — that is what keeps folder→yDoc live.
//
// Two suppression kinds:
//   - write  (create/update): matched by content hash, so an identical external
//     write is NOT accidentally swallowed.
//   - delete (unlink):        matched by path, because a delete event carries no
//     content to hash. Used by the flusher when it renames/moves/trashes a file.
import { createHash } from 'node:crypto'

const DEFAULT_TTL_MS = 15_000

interface WriteSuppression {
  hash: string
  expiresAt: number
}

interface DeleteSuppression {
  expiresAt: number
  /** Consume-count: a rename removes a path exactly once. */
  count: number
}

export class SuppressionRegistry {
  private readonly writes = new Map<string, WriteSuppression[]>()
  private readonly deletes = new Map<string, DeleteSuppression>()
  private readonly ttlMs: number

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs
  }

  private static hash(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex')
  }

  /** Register that we are about to write `content` (text or binary) to `relPath`. */
  registerWrite(relPath: string, content: string | Buffer): void {
    const now = Date.now()
    const active = (this.writes.get(relPath) ?? []).filter((s) => s.expiresAt > now)
    active.push({ hash: SuppressionRegistry.hash(content), expiresAt: now + this.ttlMs })
    this.writes.set(relPath, active)
  }

  /**
   * Consume one write suppression for `relPath`+`content`. Returns true when the
   * event was our own echo (and should be dropped).
   */
  consumeWrite(relPath: string, content: string | Buffer): boolean {
    const list = this.writes.get(relPath)
    if (!list || list.length === 0) return false
    const now = Date.now()
    const target = SuppressionRegistry.hash(content)
    const remaining: WriteSuppression[] = []
    let consumed = false
    for (const s of list) {
      if (s.expiresAt <= now) continue
      if (!consumed && s.hash === target) {
        consumed = true
        continue
      }
      remaining.push(s)
    }
    if (remaining.length === 0) this.writes.delete(relPath)
    else this.writes.set(relPath, remaining)
    return consumed
  }

  /** Register that we are about to remove (unlink / move away) `relPath`. */
  registerDelete(relPath: string): void {
    const existing = this.deletes.get(relPath)
    const expiresAt = Date.now() + this.ttlMs
    if (existing && existing.expiresAt > Date.now()) {
      existing.count += 1
      existing.expiresAt = expiresAt
    } else {
      this.deletes.set(relPath, { count: 1, expiresAt })
    }
  }

  /** Consume one delete suppression for `relPath`. True when it was our echo. */
  consumeDelete(relPath: string): boolean {
    const entry = this.deletes.get(relPath)
    if (!entry) return false
    if (entry.expiresAt <= Date.now()) {
      this.deletes.delete(relPath)
      return false
    }
    entry.count -= 1
    if (entry.count <= 0) this.deletes.delete(relPath)
    return true
  }
}
