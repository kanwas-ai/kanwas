// Shared atomic-write primitive for note-content bytes.
//
// Only TWO code paths are allowed to write note content to disk (Mission A4):
//   - SyncOrchestrator.handleNoteSave  — the user-edit autosave (Mission A1)
//   - FolderFlusher's new-node initial write — a just-created note's first
//     (empty/trivial) save, so adopt.ts's prune-nodes-without-files boot
//     invariant holds
// Both go through this helper so the atomic tmp+rename pattern and suppression
// tagging never diverge between them.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { KANWAS_DIR } from './identity.js'
import type { SuppressionRegistry } from './suppression.js'

const WINDOWS_RENAME_RETRIES = 6
const WINDOWS_RENAME_DELAY_MS = 25

function isTransientWindowsRenameError(error: unknown): boolean {
  if (process.platform !== 'win32') return false
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EACCES' || code === 'EBUSY' || code === 'EEXIST' || code === 'EPERM'
}

async function renameWithRetry(source: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(source, target)
      return
    } catch (error) {
      if (!isTransientWindowsRenameError(error) || attempt >= WINDOWS_RENAME_RETRIES) throw error
      await new Promise((resolve) => setTimeout(resolve, WINDOWS_RENAME_DELAY_MS * (attempt + 1)))
    }
  }
}

/**
 * Write `bytes` to `<folder>/<rel>` atomically: write to a temp file under
 * `.kanwas/tmp/` (already watcher-ignored) then `fs.rename` over the target.
 * Suppression is registered BEFORE the rename so the watcher's echo of the
 * rename is recognised as our own write, not an external change.
 */
export async function writeFileAtomic(
  folder: string,
  rel: string,
  bytes: string,
  suppression: SuppressionRegistry
): Promise<void> {
  const abs = path.join(folder, rel)
  const tmpDir = path.join(folder, KANWAS_DIR, 'tmp')
  await fs.mkdir(tmpDir, { recursive: true })
  const tmpAbs = path.join(tmpDir, `${randomUUID()}.tmp`)
  try {
    await fs.writeFile(tmpAbs, bytes, 'utf-8')
    suppression.registerWrite(rel, bytes)
    await renameWithRetry(tmpAbs, abs)
  } finally {
    // A failed Windows replace must not leave watcher-ignored temp files behind.
    await fs.unlink(tmpAbs).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}
