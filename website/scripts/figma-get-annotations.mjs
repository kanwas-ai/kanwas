#!/usr/bin/env node

import fs from 'node:fs/promises'
import yaml from 'js-yaml'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_ANNOTATIONS_ENDPOINT = 'http://localhost:3851/v1/annotations/tree'
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_LOAD_ALL_PAGES = true
const DEFAULT_INCLUDE_EMPTY_NODES = false
const DEFAULT_INCLUDE_CATEGORIES = true

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEBSITE_ROOT = path.resolve(__dirname, '..')
const SESSION_OUTPUT_DIR = path.join(WEBSITE_ROOT, 'session')
const DEFAULT_OUTPUT_FILE = path.join(SESSION_OUTPUT_DIR, 'annotations', 'annotation.yaml')

const NODE_ID_PATTERN = /^(-?\d+)([:-])(-?\d+)$/

const OPTION_DEFINITIONS = {
  'id': { field: 'id', type: 'string' },
  'endpoint': { field: 'endpoint', type: 'string' },
  'timeout-ms': { field: 'timeoutMs', type: 'number' },
  'load-all-pages': { field: 'loadAllPages', type: 'boolean' },
  'include-empty-nodes': { field: 'includeEmptyNodes', type: 'boolean' },
  'include-categories': { field: 'includeCategories', type: 'boolean' },
  'debug-raw': { field: 'debugRaw', type: 'boolean' },
}

const HELP_TEXT = `figma-get-annotations.mjs

Fetch Figma annotations through the local image-exporter bridge HTTP API.
The script calls POST /v1/annotations/tree, flattens annotations, and writes YAML.

Usage:
  node scripts/figma-get-annotations.mjs --id <node-id-or-url> [options]

Required options:
  --id                      Node ID (123:456 or 123-456) or full Figma URL containing node-id.

Options:
  --endpoint                HTTP endpoint URL. Default: ${DEFAULT_ANNOTATIONS_ENDPOINT}
  --timeout-ms              Request timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}
  --load-all-pages          Boolean. Default: ${DEFAULT_LOAD_ALL_PAGES}
  --include-empty-nodes     Boolean. Default: ${DEFAULT_INCLUDE_EMPTY_NODES}
  --include-categories      Boolean. Default: ${DEFAULT_INCLUDE_CATEGORIES}
  --[no-]debug-raw          Include raw bridge response payload in output.
  --help                    Show this help.

Notes:
  - image-exporter bridge daemon must be running and plugin must be connected.
  - URL input is normalized by reading node-id query param (for example ?node-id=1256-20937).
  - Output file is always written to website/session/annotations/annotation.yaml.
  - Stdout returns only the saved file path.

Examples:
  node scripts/figma-get-annotations.mjs --id 123:456
  node scripts/figma-get-annotations.mjs --id https://www.figma.com/design/abc/My-File?node-id=1256-20937
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
    id: '',
    endpoint: DEFAULT_ANNOTATIONS_ENDPOINT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    loadAllPages: DEFAULT_LOAD_ALL_PAGES,
    includeEmptyNodes: DEFAULT_INCLUDE_EMPTY_NODES,
    includeCategories: DEFAULT_INCLUDE_CATEGORIES,
    debugRaw: false,
    help: false,
    idInput: '',
    idSource: '',
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

function normalizeNodeId(rawNodeId) {
  const match = rawNodeId.match(NODE_ID_PATTERN)
  if (!match) {
    return null
  }

  return `${match[1]}:${match[3]}`
}

function normalizeNodeReference(rawInput) {
  const directNodeId = normalizeNodeId(rawInput)
  if (directNodeId) {
    return { nodeId: directNodeId, source: 'node-id' }
  }

  let url
  try {
    url = new URL(rawInput)
  } catch {
    throw new Error('--id must be a node ID (123:456 or 123-456) or a Figma URL containing node-id')
  }

  const nodeIdFromUrl = url.searchParams.get('node-id') ?? url.searchParams.get('node_id')
  if (!nodeIdFromUrl) {
    throw new Error('When --id is a URL, it must include node-id query parameter')
  }

  const normalizedNodeId = normalizeNodeId(nodeIdFromUrl.trim())
  if (!normalizedNodeId) {
    throw new Error(`Unable to parse node-id from URL: ${nodeIdFromUrl}`)
  }

  return { nodeId: normalizedNodeId, source: 'url' }
}

function validateArgs(args) {
  if (!args.id) {
    throw new Error('Missing required option: --id')
  }

  const idInput = args.id.trim()
  if (!idInput) {
    throw new Error('--id must be a non-empty node ID')
  }

  if (idInput.includes(',')) {
    throw new Error('--id accepts exactly one node ID (comma-separated values are not allowed)')
  }

  const normalizedReference = normalizeNodeReference(idInput)
  args.id = normalizedReference.nodeId
  args.idInput = idInput
  args.idSource = normalizedReference.source

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number')
  }

  let endpointUrl
  try {
    endpointUrl = new URL(args.endpoint)
  } catch {
    throw new Error(`Invalid --endpoint URL: ${args.endpoint}`)
  }

  if (endpointUrl.protocol !== 'http:' && endpointUrl.protocol !== 'https:') {
    throw new Error('--endpoint must use http:// or https://')
  }

  args.endpoint = endpointUrl.toString()
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function appendDefined(target, key, value) {
  if (value === undefined || value === null) {
    return
  }

  target[key] = value
}

function buildRequestBody(args) {
  const body = {
    nodeId: args.id,
  }

  appendDefined(body, 'loadAllPages', args.loadAllPages)
  appendDefined(body, 'includeEmptyNodes', args.includeEmptyNodes)
  appendDefined(body, 'includeCategories', args.includeCategories)

  return body
}

function summarizeFailureBody(bodyText) {
  const trimmed = bodyText.trim()
  if (!trimmed) {
    return 'empty response body'
  }

  const oneLine = trimmed.replace(/\s+/g, ' ')
  return oneLine.length > 240 ? `${oneLine.slice(0, 237)}...` : oneLine
}

function extractErrorMessage(payload) {
  if (!isObject(payload) || !isObject(payload.error)) {
    return ''
  }

  const code = typeof payload.error.code === 'string' ? payload.error.code : ''
  const message = typeof payload.error.message === 'string' ? payload.error.message : ''

  if (!message && !code) {
    return ''
  }

  return code ? `${code}: ${message || 'Unknown error'}` : message
}

async function postAnnotationsTree({ endpoint, requestBody, timeoutMs }) {
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
    let payload = {}
    if (responseText.trim().length > 0) {
      try {
        payload = JSON.parse(responseText)
      } catch {
        throw new Error(`Bridge annotations API returned non-JSON body (status ${response.status})`)
      }
    }

    if (!response.ok) {
      const errorMessage = extractErrorMessage(payload) || summarizeFailureBody(responseText)
      throw new Error(`Bridge annotations request failed (${response.status}): ${errorMessage}`)
    }

    if (!isObject(payload)) {
      throw new Error('Bridge annotations API returned an invalid response payload')
    }

    if (payload.ok !== true) {
      const errorMessage = extractErrorMessage(payload) || 'Unknown error'
      throw new Error(`Bridge annotations request returned an error: ${errorMessage}`)
    }

    if (!isObject(payload.response)) {
      throw new Error('Bridge annotations API response is missing response payload')
    }

    return payload
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Bridge annotations request timed out after ${timeoutMs}ms`)
    }

    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      throw new Error(
        `Bridge annotations request failed: unable to reach ${endpoint}. Ensure image-exporter daemon is running and the Figma plugin is connected.`
      )
    }

    if (message.startsWith('Bridge annotations request') || message.startsWith('Bridge annotations API')) {
      throw error instanceof Error ? error : new Error(message)
    }

    throw new Error(`Bridge annotations request failed: ${message}`)
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeProperties(value) {
  if (!Array.isArray(value)) {
    return []
  }

  const properties = []
  for (const item of value) {
    if (!isObject(item)) {
      continue
    }

    const type = normalizeOptionalString(item.type)
    if (!type) {
      continue
    }

    properties.push({ type })
  }

  return properties
}

function buildPropertyTypes(properties) {
  const unique = new Set()
  const types = []

  for (const property of properties) {
    if (!property || typeof property.type !== 'string') {
      continue
    }

    if (unique.has(property.type)) {
      continue
    }

    unique.add(property.type)
    types.push(property.type)
  }

  return types
}

function buildCategoryMap(categories) {
  const categoryMap = new Map()
  if (!Array.isArray(categories)) {
    return categoryMap
  }

  for (const category of categories) {
    if (!isObject(category)) {
      continue
    }

    const id = normalizeOptionalString(category.id)
    if (!id || categoryMap.has(id)) {
      continue
    }

    categoryMap.set(id, {
      label: normalizeOptionalString(category.label),
      color: normalizeOptionalString(category.color),
      isPreset: typeof category.isPreset === 'boolean' ? category.isPreset : null,
    })
  }

  return categoryMap
}

function deduplicateAnnotations(entries) {
  const seen = new Set()
  const deduped = []

  for (const entry of entries) {
    const key = [
      entry.requestedNodeId ?? '',
      entry.nodeId ?? '',
      entry.layerName ?? '',
      entry.annotation ?? '',
      entry.categoryId ?? '',
      String(entry.depth ?? ''),
      entry.propertyTypes.join(','),
    ].join('\u0000')

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push({
      ...entry,
      annotationIndex: deduped.length,
    })
  }

  return deduped
}

function flattenAnnotations({ nodes, requestedNodeId, categoryMap }) {
  const entries = []

  if (!Array.isArray(nodes)) {
    return entries
  }

  for (const node of nodes) {
    if (!isObject(node)) {
      continue
    }

    const nodeId = normalizeOptionalString(node.nodeId)
    const layerName = normalizeOptionalString(node.nodeName)
    const nodeType = normalizeOptionalString(node.nodeType)
    const depth = Number.isFinite(node.depth) ? node.depth : null
    const annotations = Array.isArray(node.annotations) ? node.annotations : []

    for (const rawAnnotation of annotations) {
      if (!isObject(rawAnnotation)) {
        continue
      }

      const label = normalizeOptionalString(rawAnnotation.label)
      const labelMarkdown = normalizeOptionalString(rawAnnotation.labelMarkdown)
      const categoryId = normalizeOptionalString(rawAnnotation.categoryId)
      const properties = normalizeProperties(rawAnnotation.properties)
      const propertyTypes = buildPropertyTypes(properties)
      const annotation = labelMarkdown ?? label ?? ''

      const category = categoryId ? (categoryMap.get(categoryId) ?? null) : null

      entries.push({
        requestedNodeId,
        nodeId,
        layerName,
        nodeType,
        depth,
        sourceAttribute: 'figma.annotations',
        annotation,
        label,
        labelMarkdown,
        categoryId,
        categoryLabel: category?.label ?? null,
        categoryColor: category?.color ?? null,
        categoryIsPreset: category?.isPreset ?? null,
        propertyTypes,
        properties,
      })
    }
  }

  return deduplicateAnnotations(entries)
}

function serializeOutput(payload) {
  const serialized = yaml.dump(payload, {
    noRefs: true,
    lineWidth: -1,
    sortKeys: false,
  })

  return serialized.endsWith('\n') ? serialized : `${serialized}\n`
}

async function writeOutputFile(payload) {
  const absolutePath = DEFAULT_OUTPUT_FILE
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  const serialized = serializeOutput(payload)
  await fs.writeFile(absolutePath, serialized, 'utf8')
  return absolutePath
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP_TEXT)
    return
  }

  validateArgs(args)

  const requestBody = buildRequestBody(args)
  const payload = await postAnnotationsTree({
    endpoint: args.endpoint,
    requestBody,
    timeoutMs: args.timeoutMs,
  })

  const requestId = normalizeOptionalString(payload.requestId)
  const responsePayload = isObject(payload.response) ? payload.response : {}
  const nodes = Array.isArray(responsePayload.nodes) ? responsePayload.nodes : []
  const categories = Array.isArray(responsePayload.categories) ? responsePayload.categories : []
  const categoryMap = buildCategoryMap(categories)

  const annotations = flattenAnnotations({
    nodes,
    requestedNodeId: args.id,
    categoryMap,
  })

  const nodesWithAnnotations = new Set(
    annotations.map((entry) => entry.nodeId).filter((nodeId) => typeof nodeId === 'string' && nodeId.length > 0)
  )

  const annotationsMissingText = annotations.filter((entry) => !entry.annotation).length
  const annotationsMissingCategoryId = annotations.filter((entry) => !entry.categoryId).length

  const output = {
    request: {
      endpoint: args.endpoint,
      idInput: args.idInput,
      idSource: args.idSource,
      id: args.id,
      timeoutMs: args.timeoutMs,
      loadAllPages: args.loadAllPages,
      includeEmptyNodes: args.includeEmptyNodes,
      includeCategories: args.includeCategories,
      body: requestBody,
    },
    summary: {
      requestId,
      rootNodeId: normalizeOptionalString(responsePayload.rootNodeId),
      rootNodeType: normalizeOptionalString(responsePayload.rootNodeType),
      visitedNodeCount: Number.isFinite(responsePayload.visitedNodeCount) ? responsePayload.visitedNodeCount : null,
      annotatedNodeCount: Number.isFinite(responsePayload.annotatedNodeCount)
        ? responsePayload.annotatedNodeCount
        : null,
      nodeCount: nodes.length,
      categoryCount: categories.length,
      annotationCount: annotations.length,
      nodesWithAnnotations: nodesWithAnnotations.size,
      annotationsMissingText,
      annotationsMissingCategoryId,
      durationMs: Number.isFinite(responsePayload.durationMs) ? responsePayload.durationMs : null,
    },
    annotations,
  }

  if (args.debugRaw) {
    output.debugRaw = {
      bridgeResponse: payload,
    }
  }

  const outputPath = await writeOutputFile(output)
  process.stdout.write(`${outputPath}\n`)

  if (annotations.length === 0) {
    process.stderr.write('figma-get-annotations: warning - no annotations found in bridge response for this node.\n')
  }

  if (annotationsMissingText > 0) {
    process.stderr.write(
      `figma-get-annotations: warning - ${annotationsMissingText} annotation entries are missing label and labelMarkdown text.\n`
    )
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`figma-get-annotations error: ${message}\n`)
  process.exitCode = 1
})
