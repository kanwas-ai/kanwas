#!/usr/bin/env node
// node-pty ships a `spawn-helper` binary per platform under
// prebuilds/<platform-arch>/spawn-helper that it exec's directly (see
// node_modules/node-pty/lib/unixTerminal.js). pnpm's tarball extraction does
// not reliably preserve that file's executable bit (observed: it lands
// `-rw-r--r--`), which makes every pty spawn fail with "posix_spawnp
// failed." Runs as this package's own `postinstall` (always trusted —
// distinct from the "ignored build scripts" gate pnpm applies to
// *dependencies'* lifecycle scripts) so `pnpm install` self-heals this on
// every machine/CI run without needing `pnpm approve-builds`.
import { createRequire } from 'node:module'
import { readdirSync, statSync, chmodSync, existsSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)

function main() {
  let ptyPackageJson
  try {
    ptyPackageJson = require.resolve('node-pty/package.json')
  } catch {
    console.log('[fix-node-pty-perms] node-pty not installed — skipping')
    return
  }
  const prebuildsDir = path.join(path.dirname(ptyPackageJson), 'prebuilds')
  if (!existsSync(prebuildsDir)) {
    console.log('[fix-node-pty-perms] no prebuilds/ dir (built from source?) — skipping')
    return
  }

  let fixed = 0
  for (const platformArch of readdirSync(prebuildsDir)) {
    const helper = path.join(prebuildsDir, platformArch, 'spawn-helper')
    if (!existsSync(helper)) continue
    const mode = statSync(helper).mode
    // rwxr-xr-x
    chmodSync(helper, 0o755)
    if ((mode & 0o111) === 0) fixed++
  }
  console.log(
    `[fix-node-pty-perms] checked prebuilds, fixed ${fixed} non-executable spawn-helper binar${fixed === 1 ? 'y' : 'ies'}`
  )
}

main()
