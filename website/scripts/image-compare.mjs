#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const OPTION_DEFINITIONS = {
  'left': { field: 'left', type: 'string' },
  'right': { field: 'right', type: 'string' },
  'out': { field: 'out', type: 'string' },
  'fail-on-diff': { field: 'failOnDiff', type: 'boolean' },
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const OUTPUT_DIFF_NAME = 'diff.png'
const OUTPUT_REPORT_NAME = 'diff-report.json'

const HELP_TEXT = `image-compare.mjs

Compare two images with odiff and export a diff image.

Usage:
  node scripts/image-compare.mjs --left <image-a> --right <image-b> --out <output-dir> [options]

Required options:
  --left <path>         Left/source image path.
  --right <path>        Right/reference image path.
  --out <path>          Output directory for diff image and report.
                        Must be nested deeper than session/browser.

Optional:
  --[no-]fail-on-diff   Exit with code 2 when differences are found. Default: false
  --help                Show this help.

Outputs:
  <out>/diff.png
  <out>/diff-report.json

Example:
  node scripts/image-compare.mjs \
    --left ./artifacts/current.png \
    --right ./artifacts/reference.png \
    --out ./session/browser/run-01/compare
`

function splitInlineOption(token) {
  const eqIndex = token.indexOf('=')
  if (eqIndex === -1) {
    return { key: token, value: undefined, hasInlineValue: false }
  }
  return {
    key: token.slice(0, eqIndex),
    value: token.slice(eqIndex + 1),
    hasInlineValue: true,
  }
}

function parseBoolean(raw, flagName) {
  if (typeof raw === 'boolean') {
    return raw
  }

  const normalized = String(raw).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false
  }

  throw new Error(`Invalid boolean for --${flagName}: ${raw}`)
}

function parseArgs(argv) {
  const args = {
    left: '',
    right: '',
    out: '',
    failOnDiff: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--help' || token === '-h') {
      args.help = true
      continue
    }

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`)
    }

    if (token.startsWith('--no-')) {
      const key = token.slice(5)
      const definition = OPTION_DEFINITIONS[key]
      if (!definition || definition.type !== 'boolean') {
        throw new Error(`Unknown option: --no-${key}`)
      }
      args[definition.field] = false
      continue
    }

    const { key, value: inlineValue, hasInlineValue } = splitInlineOption(token.slice(2))
    const definition = OPTION_DEFINITIONS[key]
    if (!definition) {
      throw new Error(`Unknown option: --${key}`)
    }

    let rawValue = inlineValue
    if (!hasInlineValue) {
      const next = argv[index + 1]
      if (definition.type === 'boolean') {
        if (next && !next.startsWith('--')) {
          rawValue = next
          index += 1
        } else {
          rawValue = 'true'
        }
      } else {
        if (!next || next.startsWith('--')) {
          throw new Error(`Missing value for --${key}`)
        }
        rawValue = next
        index += 1
      }
    }

    if (definition.type === 'boolean') {
      args[definition.field] = parseBoolean(rawValue, key)
    } else {
      args[definition.field] = rawValue
    }
  }

  return args
}

function resolveCliPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
}

function hasSessionBrowserRootSuffix(filePath) {
  const segments = path.normalize(filePath).split(path.sep).filter(Boolean)
  if (segments.length < 2) {
    return false
  }
  return segments[segments.length - 2] === 'session' && segments[segments.length - 1] === 'browser'
}

function validateOutDirNesting(outDir) {
  if (!hasSessionBrowserRootSuffix(outDir)) {
    return
  }

  throw new Error(
    'Output path cannot be session/browser directly. Use a nested directory such as --out ./session/browser/<run>/<step>.'
  )
}

function toOutputPath(filePath) {
  const relative = path.relative(REPO_ROOT, filePath)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative || '.'
  }
  return filePath
}

async function assertExists(filePath, label) {
  try {
    await fs.access(filePath)
  } catch {
    throw new Error(`${label} not found: ${filePath}`)
  }
}

function parseOdiffMetrics(outputText) {
  const lines = outputText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    if (line.includes(';')) {
      const [rawPixels, rawPercent] = line.split(';', 2)
      const mismatchPixels = Number.parseFloat(rawPixels)
      const mismatchPercent = Number.parseFloat(rawPercent)
      if (Number.isFinite(mismatchPixels) && Number.isFinite(mismatchPercent)) {
        return {
          score: mismatchPercent,
          mismatch_pixels: mismatchPixels,
          mismatch_percent: mismatchPercent,
        }
      }
    }

    if (/^-?\d+(?:\.\d+)?$/.test(line)) {
      const parsed = Number.parseFloat(line)
      if (Number.isFinite(parsed)) {
        return {
          score: parsed,
          mismatch_pixels: parsed,
          mismatch_percent: null,
        }
      }
    }
  }

  const loose = outputText.match(/-?\d+(?:\.\d+)?/)
  if (!loose) {
    return {
      score: null,
      mismatch_pixels: null,
      mismatch_percent: null,
    }
  }

  const parsed = Number.parseFloat(loose[0])
  if (!Number.isFinite(parsed)) {
    return {
      score: null,
      mismatch_pixels: null,
      mismatch_percent: null,
    }
  }

  return {
    score: parsed,
    mismatch_pixels: parsed,
    mismatch_percent: null,
  }
}

function runOdiff(leftPath, rightPath, diffPath) {
  const result = spawnSync('odiff', [leftPath, rightPath, diffPath, '--parsable-stdout'], {
    encoding: 'utf8',
  })

  if (result.error) {
    throw new Error(`odiff failed to launch: ${result.error.message}`)
  }

  const stdout = (result.stdout || '').trim()
  const stderr = (result.stderr || '').trim()
  const combinedOutput = `${stdout}\n${stderr}`.trim()
  const metrics = parseOdiffMetrics(combinedOutput)
  const status = result.status ?? 1

  return {
    odiff_exit_code: status,
    ok: status === 0 || status === 22,
    stdout,
    stderr,
    score: metrics.score,
    mismatch_pixels: metrics.mismatch_pixels,
    mismatch_percent: metrics.mismatch_percent,
  }
}

async function writeReport(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP_TEXT)
    return
  }

  args.left = String(args.left || '').trim()
  args.right = String(args.right || '').trim()
  args.out = String(args.out || '').trim()

  if (!args.left || !args.right || !args.out) {
    const missing = []
    if (!args.left) missing.push('--left')
    if (!args.right) missing.push('--right')
    if (!args.out) missing.push('--out')
    throw new Error(`Missing required option(s): ${missing.join(', ')}\n\n${HELP_TEXT}`)
  }

  const leftPath = resolveCliPath(args.left)
  const rightPath = resolveCliPath(args.right)
  const outDir = resolveCliPath(args.out)
  validateOutDirNesting(outDir)
  const diffPath = path.join(outDir, OUTPUT_DIFF_NAME)
  const reportPath = path.join(outDir, OUTPUT_REPORT_NAME)

  await assertExists(leftPath, 'Left image')
  await assertExists(rightPath, 'Right image')
  await fs.mkdir(path.dirname(diffPath), { recursive: true })

  const result = runOdiff(leftPath, rightPath, diffPath)

  const report = {
    generated_at: new Date().toISOString(),
    left: leftPath,
    right: rightPath,
    diff: toOutputPath(diffPath),
    odiff_exit_code: result.odiff_exit_code,
    status: result.ok ? 'ok' : 'error',
    score: result.score,
    mismatch_pixels: result.mismatch_pixels,
    mismatch_percent: result.mismatch_percent,
    stdout: result.stdout,
    stderr: result.stderr,
  }

  await writeReport(reportPath, report)

  process.stdout.write(`${toOutputPath(diffPath)}\n${toOutputPath(reportPath)}\n`)

  if (!result.ok) {
    process.exitCode = 1
    return
  }

  if (args.failOnDiff && result.odiff_exit_code === 22) {
    process.exitCode = 2
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`image-compare error: ${message}\n`)
  process.exitCode = 1
})
