// Seed a brand-new workspace with the AGENTS.md guide and the `.mcp.json`
// MCP-server registration (WP-C: so a user's CLI agent can find
// `kanwas_get_ui_context` / `kanwas_workspace_info` without manual setup).
//
// When the local runtime opens an EMPTY folder (a fresh workspace), drop the
// packaged `templates/AGENTS.md` and `templates/.mcp.json` into it so a
// user's CLI agent (Claude Code, Codex) finds instructions on how the folder
// maps to the canvas, and can auto-register the runtime's MCP endpoint. This
// mirrors the existing empty-folder welcome-note behavior, but writes real,
// persistent files (AGENTS.md then adopts as the workspace's first node)
// instead of an ephemeral in-memory note.
//
// Gated on emptiness so pointing the runtime at an EXISTING folder never injects
// a file the user didn't create. Never overwrites an existing file — each of
// AGENTS.md/.mcp.json is seeded independently, so a user who already has one
// but not the other still gets the missing one. Runs before adoption, so
// AGENTS.md is adopted as a normal node on first boot (.mcp.json is a
// dotfile — adoption skips it, same as `.git`/`.kanwas`).
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Logger } from 'pino'
import { KANWAS_DIR } from './identity.js'

const AGENTS_FILE = 'AGENTS.md'
const MCP_CONFIG_FILE = '.mcp.json'

/** Dirs/files that don't count as workspace content when judging emptiness. */
const SKIP_ENTRIES = new Set(['.git', 'node_modules', '.DS_Store', KANWAS_DIR])

/**
 * A folder is "empty" (a new workspace) when it has no adoptable content: every
 * top-level entry is either a dotfile or one of the skipped dirs. This matches the
 * condition under which adoption would otherwise render an empty canvas (any
 * content file or sub-directory produces at least one canvas item).
 */
async function folderIsEmpty(folder: string): Promise<boolean> {
  let entries
  try {
    entries = await fsp.readdir(folder, { withFileTypes: true })
  } catch {
    return false
  }
  return !entries.some((e) => !e.name.startsWith('.') && !SKIP_ENTRIES.has(e.name))
}

/**
 * Copy a packaged template to `folder/filename`, unless the destination
 * already exists (never overwrites a user's file). Non-fatal: a missing
 * template or write error is logged and skipped. Returns true when written.
 */
async function seedFileIfMissing(
  folder: string,
  filename: string,
  srcTemplatePath: string,
  logger: Logger
): Promise<boolean> {
  const dest = path.join(folder, filename)

  try {
    await fsp.access(dest)
    return false // already exists — never overwrite
  } catch {
    // does not exist → candidate for seeding
  }

  let template: string
  try {
    template = await fsp.readFile(srcTemplatePath, 'utf-8')
  } catch (error) {
    logger.warn({ error: String(error), srcTemplatePath }, 'Seed template not found — skipping')
    return false
  }

  await fsp.writeFile(dest, template, 'utf-8')
  logger.info({ file: filename }, 'Seeded new workspace')
  return true
}

/**
 * If `folder` is a brand-new (empty) workspace, copy the packaged AGENTS.md
 * guide and the `.mcp.json` MCP-server registration into it — each seeded
 * independently (never overwriting a file the user already has). Returns
 * true if AGENTS.md was written (mount.ts only cares about that one, since
 * it's the file that adopts as a node).
 */
export async function seedWorkspaceTemplateIfEmpty(
  folder: string,
  logger: Logger,
  templatesDir: string
): Promise<boolean> {
  const log = logger.child({ component: 'SeedTemplate' })
  if (!(await folderIsEmpty(folder))) return false

  const wroteAgents = await seedFileIfMissing(folder, AGENTS_FILE, path.join(templatesDir, 'AGENTS.md'), log)
  await seedFileIfMissing(folder, MCP_CONFIG_FILE, path.join(templatesDir, 'mcp.json.template'), log)
  return wroteAgents
}
