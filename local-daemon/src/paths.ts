import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

/**
 * Filesystem locations the daemon + launcher CLI share. Resolved relative to the
 * compiled module (`dist/…`) OR the tsx-run source (`src/…`) — both are two
 * levels under the repo root and one level under `local-daemon/`, so the maths
 * below is identical either way.
 *
 *   <repo>/local-daemon/{dist,src}/paths.js  →  __dirname
 *     ../            = <repo>/local-daemon
 *     ../..          = <repo>
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** `<repo>/local-daemon` — the package root. */
export const PACKAGE_ROOT = path.resolve(__dirname, '..')

/** `<repo>` — the monorepo root (contains `frontend/`, `local-daemon/`, …). */
export const REPO_ROOT = path.resolve(__dirname, '..', '..')

/** The stock frontend package. */
export const FRONTEND_DIR = path.join(REPO_ROOT, 'frontend')

/** The untracked prod frontend bundle the daemon serves (`vite build` output). */
export const WEB_DIST_DIR = path.join(PACKAGE_ROOT, 'web-dist')

/** Untracked build-mode env the `kanwasup` frontend build reads. */
export const KANWASUP_ENV_FILE = path.join(FRONTEND_DIR, '.env.kanwasup.local')

/**
 * Per-user daemon state dir: `~/.kanwas`. Overridable via `KANWAS_HOME` — tests
 * set this to a scratch directory so they never read/write the user's real
 * `~/.kanwas` (vaults.json in particular). Never set in production.
 */
export const KANWAS_HOME = process.env.KANWAS_HOME
  ? path.resolve(process.env.KANWAS_HOME)
  : path.join(os.homedir(), '.kanwas')

/** Single-instance registry the CLI reads and the daemon writes. */
export const INSTANCE_FILE = path.join(KANWAS_HOME, 'daemon.json')

/** Detached-daemon log (stdout+stderr) written by `kanwas up`. */
export const DAEMON_LOG_FILE = path.join(KANWAS_HOME, 'daemon.log')

/**
 * Persistent multi-folder vault registry (Phase 2): every folder the daemon
 * has ever been pointed at, so it can remount them all at boot without the
 * launcher having to remember/pass them. See `vaults.ts`.
 */
export const VAULTS_FILE = path.join(KANWAS_HOME, 'vaults.json')
