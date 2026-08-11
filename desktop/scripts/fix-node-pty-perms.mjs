#!/usr/bin/env node
import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

let packageJson
try {
  packageJson = require.resolve('node-pty/package.json')
} catch {
  console.log('[fix-node-pty-perms] node-pty not installed; skipping')
  process.exit(0)
}

const prebuilds = path.join(path.dirname(packageJson), 'prebuilds')
if (!existsSync(prebuilds)) process.exit(0)

let fixed = 0
for (const platformArch of readdirSync(prebuilds)) {
  const helper = path.join(prebuilds, platformArch, 'spawn-helper')
  if (!existsSync(helper)) continue
  if ((statSync(helper).mode & 0o111) === 0) fixed += 1
  chmodSync(helper, 0o755)
}
console.log(`[fix-node-pty-perms] fixed ${fixed} spawn-helper permission(s)`)
