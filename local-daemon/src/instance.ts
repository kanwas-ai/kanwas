import fs from 'node:fs'
import path from 'node:path'

/**
 * The single-instance record the running daemon publishes to `~/.kanwas/daemon.json`
 * (only when started with `--instance-file`, i.e. via the `kanwas` launcher). The
 * CLI reads it to answer `up` / `status` / `down` from any directory.
 */
export interface DaemonInstance {
  pid: number
  folder: string
  host: string
  restPort: number
  yjsPort: number
  workspaceId: string
  workspaceUrlId: string
  /** The URL the launcher opens — sets the auth token then redirects into the canvas. */
  loginUrl: string
  /** Deep link to the workspace canvas (assumes the token is already set). */
  workspaceUrl: string
  startedAt: string
}

/** Read + parse the instance record, or null if absent/corrupt. */
export function readInstance(file: string): DaemonInstance | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as DaemonInstance
    if (typeof parsed?.pid === 'number' && typeof parsed?.folder === 'string') return parsed
    return null
  } catch {
    return null
  }
}

/** Write the instance record (creates `~/.kanwas` if needed). */
export function writeInstance(file: string, instance: DaemonInstance): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(instance, null, 2)}\n`, 'utf-8')
}

/** Remove the instance record; best-effort. */
export function removeInstance(file: string): void {
  try {
    fs.unlinkSync(file)
  } catch {
    /* already gone */
  }
}

/**
 * Is `pid` a live process? `kill(pid, 0)` throws ESRCH when dead; EPERM means it
 * exists but is owned by someone else (treated as alive).
 */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
