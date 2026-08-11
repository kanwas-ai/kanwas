#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const projectRoot = path.resolve(websiteRoot, '..')
const FIXED_OUTPUT_DIR_RELATIVE = path.join('website', 'session', 'export')
const FIXED_OUTPUT_DIR = path.join(projectRoot, FIXED_OUTPUT_DIR_RELATIVE)
const BRIDGE_ENDPOINT = 'http://localhost:3851/v1/images'

const DEFAULTS = {
  timeoutMs: 120000,
  pretty: true,
  format: 'png',
  loadAllPages: true,
}

const ALLOWED_FORMATS = new Set(['jpg', 'png', 'svg', 'pdf', 'svg_string'])
const ALLOWED_COLOR_PROFILES = new Set(['DOCUMENT', 'SRGB', 'DISPLAY_P3_V4'])

const OPTION_DEFINITIONS = {
  'nodes': { field: 'nodes', type: 'string' },
  'ids': { field: 'ids', type: 'string' },
  'format': { field: 'format', type: 'string' },
  'scale': { field: 'scale', type: 'number' },
  'width': { field: 'width', type: 'number' },
  'height': { field: 'height', type: 'number' },
  'svg-outline-text': { field: 'svgOutlineText', type: 'boolean' },
  'svg-include-id': { field: 'svgIncludeId', type: 'boolean' },
  'svg-simplify-stroke': { field: 'svgSimplifyStroke', type: 'boolean' },
  'contents-only': { field: 'contentsOnly', type: 'boolean' },
  'use-absolute-bounds': { field: 'useAbsoluteBounds', type: 'boolean' },
  'exclude-effects': { field: 'excludeEffects', type: 'boolean' },
  'load-all-pages': { field: 'loadAllPages', type: 'boolean' },
  'suffix': { field: 'suffix', type: 'string' },
  'color-profile': { field: 'colorProfile', type: 'string' },
  'timeout-ms': { field: 'timeoutMs', type: 'number' },
  'pretty': { field: 'pretty', type: 'boolean' },
}

const HELP_TEXT = `figma-get-images.mjs

Export images through the local image-exporter bridge HTTP API.

Usage:
  node scripts/figma-get-images.mjs --nodes <node-id[,node-id...]> [options]

Required options:
  --nodes                 Comma-separated node IDs to export.
                          Alias: --ids

Bridge request options:
  --format                jpg | png | svg | pdf | svg_string (default: ${DEFAULTS.format})
  --scale                 Number between 0.01 and 4
  --width                 Number > 0
  --height                Number > 0
                           Use only one of --scale, --width, or --height.
  --svg-outline-text      Boolean
  --svg-include-id        Boolean
  --svg-simplify-stroke   Boolean
  --contents-only         Boolean (Figma default: true)
                           true  -> export only selected node content
                                    (ignore overlapping siblings and their effects, like shadows)
                           false -> include overlapping siblings/effects in same area
                                    (use when outside context should remain visible)
  --use-absolute-bounds   Boolean (Figma default: false)
                           true  -> keep full node bounds, including empty/cropped space
                                    (best for text/frame alignment)
                           false -> tight crop to rendered pixels
                                    (best for icons/assets)
                           note  -> controls crop box only (not sibling overlap)
  --exclude-effects       Boolean (default: false)
                           true  -> temporarily remove effects from requested nodes during export
                                     (DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, BACKGROUND_BLUR)
                           false -> preserve node effects
  --load-all-pages        Boolean (default: ${DEFAULTS.loadAllPages})
  --suffix                Optional string suffix
  --color-profile         DOCUMENT | SRGB | DISPLAY_P3_V4

Transport and output:
  --timeout-ms            Request timeout in ms (default: ${DEFAULTS.timeoutMs})
  --[no-]pretty           Pretty-print JSON output (default: ${DEFAULTS.pretty})
  --help                  Show this help

Bridge endpoint is fixed to:
  ${BRIDGE_ENDPOINT}

Exports are always copied to:
  ${FIXED_OUTPUT_DIR_RELATIVE}

Boolean parsing accepts: true/false, 1/0, yes/no, on/off.
You can also use --no-<option> for false.

Examples:
  # Reusable asset/icon: ignore overlap, tight crop
  node scripts/figma-get-images.mjs --nodes 1:2 --format png --scale 2 --contents-only true --use-absolute-bounds false

  # Screenshot-like context: include overlap (for example neighboring shadows/glows)
  node scripts/figma-get-images.mjs --nodes 1:2 --format png --scale 2 --contents-only false --use-absolute-bounds false

  # Preserve full node box for exact layout/text placement
  node scripts/figma-get-images.mjs --nodes 1:2 --format png --scale 2 --contents-only true --use-absolute-bounds true

  # SVG with selectable text and explicit bounds behavior
  node scripts/figma-get-images.mjs --ids 1:2 --format svg --svg-outline-text false --contents-only true --use-absolute-bounds true
`

function splitInlineOption(token) {
  const index = token.indexOf('=')
  if (index === -1) {
    return { key: token, value: undefined, hasInlineValue: false }
  }

  return {
    key: token.slice(0, index),
    value: token.slice(index + 1),
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
    nodes: '',
    ids: '',
    format: DEFAULTS.format,
    scale: undefined,
    width: undefined,
    height: undefined,
    svgOutlineText: undefined,
    svgIncludeId: undefined,
    svgSimplifyStroke: undefined,
    contentsOnly: undefined,
    useAbsoluteBounds: undefined,
    excludeEffects: undefined,
    loadAllPages: DEFAULTS.loadAllPages,
    suffix: '',
    colorProfile: '',
    timeoutMs: DEFAULTS.timeoutMs,
    pretty: DEFAULTS.pretty,
    help: false,
    nodeIds: [],
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
      continue
    }

    if (definition.type === 'number') {
      args[definition.field] = parseNumber(rawValue, key)
      continue
    }

    args[definition.field] = rawValue
  }

  return args
}

function validateArgs(args) {
  const hasNodes = typeof args.nodes === 'string' && args.nodes.trim().length > 0
  const hasIds = typeof args.ids === 'string' && args.ids.trim().length > 0

  if (!hasNodes && !hasIds) {
    throw new Error('Missing required option: --nodes (alias: --ids)')
  }

  if (hasNodes && hasIds) {
    throw new Error('Use either --nodes or --ids, not both')
  }

  const rawNodeValue = hasNodes ? args.nodes : args.ids
  const normalizedNodeIds = rawNodeValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((nodeId) => nodeId.replace(/-/g, ':'))

  if (normalizedNodeIds.length === 0) {
    throw new Error('--nodes must contain at least one node ID')
  }

  args.nodeIds = normalizedNodeIds

  if (!ALLOWED_FORMATS.has(args.format)) {
    throw new Error(`--format must be one of: ${Array.from(ALLOWED_FORMATS).join(', ')}`)
  }

  if (args.scale !== undefined && (args.scale < 0.01 || args.scale > 4)) {
    throw new Error('--scale must be between 0.01 and 4')
  }

  if (args.width !== undefined && args.width <= 0) {
    throw new Error('--width must be > 0')
  }

  if (args.height !== undefined && args.height <= 0) {
    throw new Error('--height must be > 0')
  }

  const constraintCount = [args.scale, args.width, args.height].filter((value) => value !== undefined).length
  if (constraintCount > 1) {
    throw new Error('Use only one of --scale, --width, or --height')
  }

  if (args.colorProfile && !ALLOWED_COLOR_PROFILES.has(args.colorProfile)) {
    throw new Error(`--color-profile must be one of: ${Array.from(ALLOWED_COLOR_PROFILES).join(', ')}`)
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number')
  }
}

function appendDefined(target, key, value) {
  if (value === undefined || value === null || value === '') {
    return
  }
  target[key] = value
}

function buildRequestBody(args) {
  const body = {
    nodeIds: args.nodeIds,
    format: args.format,
    loadAllPages: args.loadAllPages,
  }

  appendDefined(body, 'scale', args.scale)
  appendDefined(body, 'width', args.width)
  appendDefined(body, 'height', args.height)
  appendDefined(body, 'svgOutlineText', args.svgOutlineText)
  appendDefined(body, 'svgIncludeId', args.svgIncludeId)
  appendDefined(body, 'svgSimplifyStroke', args.svgSimplifyStroke)
  appendDefined(body, 'contentsOnly', args.contentsOnly)
  appendDefined(body, 'useAbsoluteBounds', args.useAbsoluteBounds)
  appendDefined(body, 'excludeEffects', args.excludeEffects)
  appendDefined(body, 'suffix', args.suffix)
  appendDefined(body, 'colorProfile', args.colorProfile)

  return body
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function postImages({ endpoint, requestBody, timeoutMs }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    const responseText = await response.text()
    let payload
    try {
      payload = responseText ? JSON.parse(responseText) : {}
    } catch {
      throw new Error(`Bridge API returned non-JSON body (status ${response.status})`)
    }

    if (!response.ok) {
      const errorCode = typeof payload?.error?.code === 'string' ? `${payload.error.code}: ` : ''
      const errorMessage = typeof payload?.error?.message === 'string' ? payload.error.message : response.statusText
      throw new Error(`Bridge API request failed (${response.status}): ${errorCode}${errorMessage}`)
    }

    if (!isObject(payload) || payload.ok !== true) {
      const errorCode = typeof payload?.error?.code === 'string' ? `${payload.error.code}: ` : ''
      const errorMessage =
        typeof payload?.error?.message === 'string' ? payload.error.message : 'Unexpected response payload'
      throw new Error(`Bridge API returned an invalid success payload: ${errorCode}${errorMessage}`)
    }

    return payload
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Bridge API request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function getUniqueDestination(directory, fileName) {
  const parsed = path.parse(fileName)
  let counter = 0

  while (true) {
    const suffix = counter === 0 ? '' : `-${counter}`
    const candidateName = `${parsed.name}${suffix}${parsed.ext}`
    const candidatePath = path.join(directory, candidateName)

    if (!(await pathExists(candidatePath))) {
      return candidatePath
    }

    counter += 1
  }
}

function normalizeResponseExports(payload) {
  const responsePayload = isObject(payload?.response) ? payload.response : {}
  const exportsList = Array.isArray(responsePayload.exports) ? responsePayload.exports : []
  const responseErrors = Array.isArray(responsePayload.errors) ? responsePayload.errors : []
  return { exportsList, responseErrors }
}

async function copyExportsToFixedDirectory(payload) {
  const { exportsList } = normalizeResponseExports(payload)
  await fs.mkdir(FIXED_OUTPUT_DIR, { recursive: true })

  const copiedFiles = []
  const copyErrors = []

  for (let index = 0; index < exportsList.length; index += 1) {
    const item = exportsList[index]
    const sourcePath = typeof item?.filePath === 'string' ? item.filePath : ''

    if (!sourcePath) {
      copyErrors.push({
        nodeId: typeof item?.nodeId === 'string' ? item.nodeId : `index-${index}`,
        message: 'Missing filePath in bridge response export item',
      })
      continue
    }

    try {
      const destinationPath = await getUniqueDestination(FIXED_OUTPUT_DIR, path.basename(sourcePath))
      await fs.copyFile(sourcePath, destinationPath)
      copiedFiles.push(destinationPath)
    } catch (error) {
      copyErrors.push({
        nodeId: typeof item?.nodeId === 'string' ? item.nodeId : `index-${index}`,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    expectedExportCount: exportsList.length,
    copiedFiles,
    copyErrors,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP_TEXT)
    return
  }

  validateArgs(args)

  const requestBody = buildRequestBody(args)
  const payload = await postImages({
    endpoint: BRIDGE_ENDPOINT,
    requestBody,
    timeoutMs: args.timeoutMs,
  })

  const copyResult = await copyExportsToFixedDirectory(payload)
  if (copyResult.expectedExportCount > 0 && copyResult.copiedFiles.length === 0) {
    throw new Error('Bridge returned exports, but none could be copied to website/session/export')
  }

  const output = {
    request: {
      endpoint: BRIDGE_ENDPOINT,
      nodeIds: args.nodeIds,
      body: requestBody,
    },
    response: payload,
    output: {
      directory: FIXED_OUTPUT_DIR,
      copiedFiles: copyResult.copiedFiles,
      copyErrors: copyResult.copyErrors,
    },
  }

  process.stdout.write(`${JSON.stringify(output, null, args.pretty ? 2 : 0)}\n`)
  process.stderr.write(`figma-get-images: copied ${copyResult.copiedFiles.length} file(s) to ${FIXED_OUTPUT_DIR}\n`)

  const { responseErrors } = normalizeResponseExports(payload)
  if (responseErrors.length > 0) {
    process.stderr.write(`figma-get-images: bridge reported ${responseErrors.length} export error(s)\n`)
  }

  if (copyResult.copyErrors.length > 0) {
    process.stderr.write(`figma-get-images: warning - failed to copy ${copyResult.copyErrors.length} export file(s)\n`)
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`figma-get-images error: ${message}\n`)
  process.exitCode = 1
})
