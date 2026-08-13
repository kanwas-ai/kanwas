#!/usr/bin/env node

import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(desktopDir, 'release')

function listFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(entryPath))
    else files.push(entryPath)
  }
  return files
}

function packagedExecutable(files) {
  if (process.platform === 'darwin') {
    return files.find((file) =>
      file.endsWith(`${path.sep}Kanwas.app${path.sep}Contents${path.sep}MacOS${path.sep}Kanwas`)
    )
  }
  if (process.platform === 'win32') {
    return files.find((file) => file.toLowerCase().endsWith(`${path.sep}win-unpacked${path.sep}kanwas.exe`))
  }
  return files.find((file) => file.endsWith(`${path.sep}linux-unpacked${path.sep}kanwas`))
}

const executable = packagedExecutable(listFiles(releaseDir))
if (!executable) throw new Error(`Could not find the packaged Kanwas executable below ${releaseDir}`)

const appArguments = ['--kanwas-smoke-test', '--disable-gpu']
const command = process.platform === 'linux' ? 'xvfb-run' : executable
const args = process.platform === 'linux' ? ['-a', executable, ...appArguments] : appArguments
const childEnvironment = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
delete childEnvironment.ELECTRON_RUN_AS_NODE
const result = spawnSync(command, args, {
  cwd: desktopDir,
  env: childEnvironment,
  stdio: 'inherit',
  timeout: 60_000,
})

if (result.error) throw result.error
if (result.status !== 0) {
  throw new Error(
    `Packaged Kanwas exited with status ${result.status ?? 'unknown'}${result.signal ? ` (${result.signal})` : ''}`
  )
}

console.log(`Verified packaged app: ${executable}`)
