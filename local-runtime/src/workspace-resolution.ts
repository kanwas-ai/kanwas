// Pure workspace-resolution helpers for the multi-workspace REST surface
// (rest-server.ts). Extracted from the route handlers so they're unit-testable
// without spinning up an HTTP server or real mounts.

export interface ResolvableMount {
  workspaceId: string
  /** Hyphen-stripped id the renderer routes to (`/app/w/<urlId>`). */
  workspaceUrlId: string
  folder: string
}

/** Find a mount by either its real workspaceId OR its URL-form id — callers may send either. */
export function findMountByIdOrUrlId<T extends ResolvableMount>(mounts: T[], id: string): T | undefined {
  return mounts.find((m) => m.workspaceId === id || m.workspaceUrlId === id)
}

const REFERER_WORKSPACE_RE = /\/app\/w\/([^/?#]+)/

/** Pull the workspace URL id out of a Referer header's path, e.g. `/app/w/<urlId>/canvas/...`. */
export function extractWorkspaceUrlIdFromReferer(refererPath: string | null | undefined): string | null {
  if (!refererPath) return null
  return REFERER_WORKSPACE_RE.exec(refererPath)?.[1] ?? null
}

export interface ResolveFilesWorkspaceOptions<T extends ResolvableMount> {
  /** Explicit `?ws=` query param, if the caller sent one. */
  wsParam: string | null
  /** The pathname portion of the request's `Referer` header, if present and parseable. */
  refererPath: string | null
  mounts: T[]
  /** Preferred mount when step (c) finds the file in more than one folder. */
  activeWorkspaceId: string | undefined
  /** The raw (workspace-relative) file path being requested, for step (c). */
  relPath: string
  /** True if `relPath` resolves to a real file inside `folder`. Injected so this stays pure/testable. */
  existsInFolder: (folder: string, relPath: string) => boolean
}

/**
 * Resolve which mount a `/files/signed-url` or `/files/raw` request belongs to,
 * in order:
 *   (a) an explicit `ws` query param (workspaceId or urlId);
 *   (b) the `Referer` header's `/app/w/<urlId>` path (same-origin fetches from
 *       the SPA carry the full referrer under the default browser policy);
 *   (c) fallback: the mount whose folder actually contains the file on disk,
 *       preferring the active workspace when more than one folder has a file
 *       at that relative path.
 * Returns undefined if none of the three resolve to a mount.
 */
export function resolveFilesWorkspace<T extends ResolvableMount>(
  options: ResolveFilesWorkspaceOptions<T>
): T | undefined {
  const { wsParam, refererPath, mounts, activeWorkspaceId, relPath, existsInFolder } = options

  if (wsParam) {
    const byParam = findMountByIdOrUrlId(mounts, wsParam)
    if (byParam) return byParam
  }

  const refererUrlId = extractWorkspaceUrlIdFromReferer(refererPath)
  if (refererUrlId) {
    const byReferer = mounts.find((m) => m.workspaceUrlId === refererUrlId)
    if (byReferer) return byReferer
  }

  const containing = mounts.filter((m) => existsInFolder(m.folder, relPath))
  if (containing.length === 0) return undefined
  if (containing.length === 1) return containing[0]
  return containing.find((m) => m.workspaceId === activeWorkspaceId) ?? containing[0]
}
