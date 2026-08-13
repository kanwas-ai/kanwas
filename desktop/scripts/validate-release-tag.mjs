#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(path.join(desktopDir, 'package.json'), 'utf8'))
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME
const expectedTag = `v${packageJson.version}`

if (!tag) throw new Error('Pass a release tag or set GITHUB_REF_NAME')
if (tag !== expectedTag) {
  throw new Error(
    `Release tag ${tag} does not match desktop/package.json version ${packageJson.version}; expected ${expectedTag}`
  )
}
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  throw new Error(`Release tag ${tag} is not a supported semantic version tag`)
}

console.log(`Validated Kanwas desktop release ${tag}`)
