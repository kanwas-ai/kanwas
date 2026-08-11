#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const MODES = new Set(['full', 'selectors', 'both'])
const WAIT_UNTIL_VALUES = new Set(['load', 'domcontentloaded', 'networkidle', 'commit'])

const OPTION_DEFINITIONS = {
  'url': { field: 'url', type: 'string' },
  'out': { field: 'out', type: 'string' },
  'mode': { field: 'mode', type: 'string' },
  'selectors': { field: 'selectors', type: 'string' },
  'selectors-file': { field: 'selectorsFile', type: 'string' },
  'width': { field: 'width', type: 'number' },
  'height': { field: 'height', type: 'number' },
  'device-scale-factor': { field: 'deviceScaleFactor', type: 'number' },
  'wait-until': { field: 'waitUntil', type: 'string' },
  'wait-ms': { field: 'waitMs', type: 'number' },
  'timeout-ms': { field: 'timeoutMs', type: 'number' },
  'headless': { field: 'headless', type: 'boolean' },
  'strict-selectors': { field: 'strictSelectors', type: 'boolean' },
  'scroll-into-view': { field: 'scrollIntoView', type: 'boolean' },
  'wait-for-fonts': { field: 'waitForFonts', type: 'boolean' },
  'full-page': { field: 'fullPage', type: 'boolean' },
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const OUTPUT_FULL_NAME = 'full.png'
const OUTPUT_REPORT_NAME = 'capture-report.json'

const HELP_TEXT = `landing-capture.mjs

Fast Playwright screenshot capture for localhost landing pages.

Usage:
  node scripts/landing-capture.mjs --out <output-dir> [options]

Required options:
  --out <path>                Output directory for screenshots and report.
                               Must be nested deeper than session/browser.

Options:
  --url <url>                 Target URL. Default: http://localhost:3000
  --mode <mode>               full | selectors | both. Default: full
  --selectors <list>          Comma-separated CSS selectors.
  --selectors-file <path>     Text file with one CSS selector per line.
  --width <px>                Viewport width. Default: 1440
  --height <px>               Viewport height. Default: 900
  --device-scale-factor <n>   Device scale factor. Default: 1
  --wait-until <state>        load | domcontentloaded | networkidle | commit. Default: domcontentloaded
  --wait-ms <ms>              Extra post-navigation wait. Default: 0
  --timeout-ms <ms>           Navigation/action timeout. Default: 30000
  --[no-]headless             Run browser headless. Default: true
  --[no-]strict-selectors     Exit non-zero if any selector is missing/failed. Default: false
  --[no-]scroll-into-view     Scroll selector into view before capture. Default: true
  --[no-]wait-for-fonts       Wait for document.fonts.ready. Default: false
  --[no-]full-page            Full-page screenshot for full mode. Default: true
  --help                      Show this help.

Outputs:
  <out>/full.png
  <out>/selectors/*.png
  <out>/capture-report.json

Examples:
  node scripts/landing-capture.mjs --out ./session/browser/run-01/full --mode full
  node scripts/landing-capture.mjs --out ./session/browser/run-01/selectors --mode selectors --selectors '.hero,[data-role="hero-cta-primary"]'
  node scripts/landing-capture.mjs --out ./session/browser/run-01/both --mode both --selectors-file ./selectors.txt --strict-selectors
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

function parseNumber(raw, flagName) {
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for --${flagName}: ${raw}`)
  }
  return parsed
}

function parseArgs(argv) {
  const args = {
    url: 'http://localhost:3000',
    out: '',
    mode: 'full',
    selectors: '',
    selectorsFile: '',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    waitUntil: 'domcontentloaded',
    waitMs: 0,
    timeoutMs: 30000,
    headless: true,
    strictSelectors: false,
    scrollIntoView: true,
    waitForFonts: false,
    fullPage: true,
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
    } else if (definition.type === 'number') {
      args[definition.field] = parseNumber(rawValue, key)
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

function parseSelectorList(rawSelectors) {
  if (!rawSelectors || typeof rawSelectors !== 'string') {
    return []
  }
  return rawSelectors
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function readSelectorsFile(filePath) {
  const resolvedPath = resolveCliPath(filePath)
  const raw = await fs.readFile(resolvedPath, 'utf8')
  return raw
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

function uniqueValues(values) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    if (seen.has(value)) {
      continue
    }
    seen.add(value)
    result.push(value)
  }
  return result
}

async function collectSelectors(args) {
  const selectors = parseSelectorList(args.selectors)
  if (args.selectorsFile) {
    selectors.push(...(await readSelectorsFile(args.selectorsFile)))
  }
  return uniqueValues(selectors)
}

function sanitizeSelector(selector) {
  const compact = selector
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return compact.slice(0, 70) || 'selector'
}

function toReportPath(baseDir, filePath) {
  if (!filePath) {
    return null
  }
  const relative = path.relative(baseDir, filePath)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative || '.'
  }
  return filePath
}

function summarizeSelectorResults(items) {
  const summary = {
    requested: items.length,
    captured: 0,
    missing: 0,
    failed: 0,
  }

  for (const item of items) {
    if (item.status === 'captured') {
      summary.captured += 1
      continue
    }
    if (item.status === 'missing') {
      summary.missing += 1
      continue
    }
    summary.failed += 1
  }

  return summary
}

function validateArgs(args, selectors) {
  args.mode = String(args.mode || '')
    .trim()
    .toLowerCase()
  if (!MODES.has(args.mode)) {
    throw new Error(`--mode must be one of: ${Array.from(MODES).join(', ')}`)
  }

  args.waitUntil = String(args.waitUntil || '')
    .trim()
    .toLowerCase()
  if (!WAIT_UNTIL_VALUES.has(args.waitUntil)) {
    throw new Error(`--wait-until must be one of: ${Array.from(WAIT_UNTIL_VALUES).join(', ')}`)
  }

  if (!Number.isFinite(args.width) || args.width <= 0) {
    throw new Error('--width must be a positive number')
  }
  if (!Number.isFinite(args.height) || args.height <= 0) {
    throw new Error('--height must be a positive number')
  }
  if (!Number.isFinite(args.deviceScaleFactor) || args.deviceScaleFactor <= 0 || args.deviceScaleFactor > 4) {
    throw new Error('--device-scale-factor must be between 0 and 4')
  }
  if (!Number.isFinite(args.waitMs) || args.waitMs < 0) {
    throw new Error('--wait-ms must be a non-negative number')
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number')
  }

  args.width = Math.round(args.width)
  args.height = Math.round(args.height)

  const selectorsRequired = args.mode === 'selectors' || args.mode === 'both'
  if (selectorsRequired && selectors.length === 0) {
    throw new Error('No selectors provided. Use --selectors and/or --selectors-file when mode is selectors or both.')
  }
}

async function gotoPage(page, args) {
  await page.goto(args.url, {
    waitUntil: args.waitUntil,
    timeout: args.timeoutMs,
  })

  if (args.waitForFonts) {
    await page.evaluate(async () => {
      if (document.fonts && typeof document.fonts.ready === 'object') {
        await document.fonts.ready
      }
    })
  }

  if (args.waitMs > 0) {
    await page.waitForTimeout(args.waitMs)
  }
}

async function captureFull(page, outputPath, args) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await page.screenshot({
    path: outputPath,
    fullPage: args.fullPage,
    animations: 'disabled',
    timeout: args.timeoutMs,
  })
}

async function captureSelectors(page, selectorsDir, selectors, args) {
  await fs.mkdir(selectorsDir, { recursive: true })
  const items = []

  for (let index = 0; index < selectors.length; index += 1) {
    const selector = selectors[index]
    const locator = page.locator(selector).first()
    const count = await locator.count()
    if (count === 0) {
      items.push({
        selector,
        status: 'missing',
        path: null,
        error: 'selector_not_found',
      })
      continue
    }

    const fileName = `${String(index + 1).padStart(2, '0')}-${sanitizeSelector(selector)}.png`
    const outputPath = path.join(selectorsDir, fileName)

    try {
      if (args.scrollIntoView) {
        await locator.scrollIntoViewIfNeeded({ timeout: args.timeoutMs })
      }
      await locator.screenshot({
        path: outputPath,
        animations: 'disabled',
        timeout: args.timeoutMs,
      })
      items.push({
        selector,
        status: 'captured',
        path: outputPath,
        error: null,
      })
    } catch (error) {
      items.push({
        selector,
        status: 'failed',
        path: null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return items
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

  args.out = String(args.out || '').trim()
  if (!args.out) {
    throw new Error(`Missing required option(s): --out\n\n${HELP_TEXT}`)
  }

  const selectors = await collectSelectors(args)
  validateArgs(args, selectors)

  const outDir = resolveCliPath(args.out)
  validateOutDirNesting(outDir)
  const reportPath = path.join(outDir, OUTPUT_REPORT_NAME)
  const fullScreenshotPath = path.join(outDir, OUTPUT_FULL_NAME)
  const selectorsDir = path.join(outDir, 'selectors')

  await fs.mkdir(outDir, { recursive: true })

  const fullRequested = args.mode === 'full' || args.mode === 'both'
  const selectorsRequested = args.mode === 'selectors' || args.mode === 'both'
  const outputFiles = []

  const report = {
    generated_at: new Date().toISOString(),
    url: args.url,
    mode: args.mode,
    out_dir: toReportPath(REPO_ROOT, outDir),
    report_path: toReportPath(REPO_ROOT, reportPath),
    viewport: {
      width: args.width,
      height: args.height,
      device_scale_factor: args.deviceScaleFactor,
    },
    navigation: {
      wait_until: args.waitUntil,
      wait_ms: args.waitMs,
      wait_for_fonts: args.waitForFonts,
      timeout_ms: args.timeoutMs,
      headless: args.headless,
    },
    full: {
      requested: fullRequested,
      status: 'not_requested',
      path: null,
      error: null,
      full_page: args.fullPage,
    },
    selectors: {
      requested: selectors.length,
      strict: args.strictSelectors,
      scroll_into_view: args.scrollIntoView,
      items: [],
      summary: {
        requested: selectors.length,
        captured: 0,
        missing: 0,
        failed: 0,
      },
    },
  }

  const browser = await chromium.launch({ headless: args.headless })
  try {
    const context = await browser.newContext({
      viewport: { width: args.width, height: args.height },
      deviceScaleFactor: args.deviceScaleFactor,
    })
    const page = await context.newPage()

    try {
      await gotoPage(page, args)

      if (fullRequested) {
        await captureFull(page, fullScreenshotPath, args)
        report.full.status = 'captured'
        report.full.path = toReportPath(outDir, fullScreenshotPath)
        outputFiles.push(fullScreenshotPath)
      }

      if (selectorsRequested) {
        const selectorItems = await captureSelectors(page, selectorsDir, selectors, args)
        outputFiles.push(
          ...selectorItems.filter((item) => item.status === 'captured' && item.path).map((item) => item.path)
        )
        report.selectors.items = selectorItems.map((item) => ({
          selector: item.selector,
          status: item.status,
          path: toReportPath(outDir, item.path),
          error: item.error,
        }))
        report.selectors.summary = summarizeSelectorResults(report.selectors.items)
      }
    } catch (error) {
      if (fullRequested && report.full.status === 'not_requested') {
        report.full.status = 'failed'
        report.full.error = error instanceof Error ? error.message : String(error)
      }
      throw error
    } finally {
      await context.close()
    }
  } finally {
    await browser.close()
  }

  await writeReport(reportPath, report)
  outputFiles.push(reportPath)

  const outputLines = uniqueValues(outputFiles.map((filePath) => toReportPath(REPO_ROOT, filePath)))
  process.stdout.write(`${outputLines.join('\n')}\n`)

  if (
    selectorsRequested &&
    args.strictSelectors &&
    (report.selectors.summary.missing > 0 || report.selectors.summary.failed > 0)
  ) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`landing-capture error: ${message}\n`)
  process.exitCode = 1
})
