#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { parseArgs } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'

const SERVICES = ['node-core']
const DOCS_URL = 'https://docs.railway.com/guides/cli'
const useColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR)

const HELP_TEXT = `Usage:
  pnpm set-env-var KEY=VALUE [KEY2=VALUE2 ...] --environment <env>
  pnpm set-env-var KEY=VALUE [KEY2=VALUE2 ...] --shared
  pnpm set-env-var .env --shared
  pnpm set-env-var --env-file .env --shared

Options:
  -e, --environment <env>  Railway environment name (required unless --shared)
      --shared             Apply to all Railway environments in the project
  -f, --env-file <path>    Load variables from a .env file
      --skip-deploys       Pass --skip-deploys to Railway
      --dry-run            Print commands without executing
      --yes                Skip confirmation prompt
  -h, --help               Show help
`

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'environment': { type: 'string', short: 'e' },
    'shared': { type: 'boolean' },
    'env-file': { type: 'string', short: 'f' },
    'skip-deploys': { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    'yes': { type: 'boolean' },
    'help': { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
})

if (values.help) {
  printHelp(0)
}

await ensureRailwayInstalled()

if (values.shared && values.environment) {
  printError('Use either --shared or --environment, not both.')
  printHelp(1)
}

const envFileFromArgs = await detectEnvFile(positionals)
const envFileOption = values['env-file']
if (envFileFromArgs && envFileOption && resolvePath(envFileFromArgs) !== resolvePath(envFileOption)) {
  printError('Provide the .env file either as a positional or via --env-file, not both.')
  printHelp(1)
}

const envFilePath = envFileOption ?? envFileFromArgs
const envFileEntries = envFilePath ? await loadEnvFile(envFilePath) : []

const rawVariables = positionals.filter((entry) => entry !== envFileFromArgs)
const cliEntries = parseVariables(rawVariables)

if (envFileEntries.length === 0 && cliEntries.length === 0) {
  printError('Missing variables. Provide KEY=VALUE arguments or --env-file.')
  printHelp(1)
}

const variablesMap = mergeVariables(envFileEntries, cliEntries)
const variables = mapToVariables(variablesMap)
const variableKeys = Array.from(variablesMap.keys())

const targetEnvironment = normalizeEnvironment(values.environment)
if (!values.shared && !targetEnvironment) {
  printError('Missing --environment <env> (required unless --shared).')
  printHelp(1)
}

const skipDeploys = Boolean(values['skip-deploys'])
const dryRun = Boolean(values['dry-run'])
const yes = Boolean(values.yes)

const environments = values.shared ? await getAllEnvironments() : [targetEnvironment]
if (environments.length === 0) {
  printError('No environments found in Railway project.')
  process.exit(1)
}

printHeader('Plan')
printSummary({
  environments,
  variables: variableKeys,
  sources: buildSourceSummary(envFileEntries.length, cliEntries.length, envFilePath),
  skipDeploys,
  dryRun,
})

const rows = buildPlanRows(environments, variableKeys)
renderTable(['Environment', 'Service', 'Variables'], rows)

await requireApproval({ yes, dryRun })

const failed = []
for (const environment of environments) {
  for (const service of SERVICES) {
    const args = ['variable', 'set', '--service', service, '--environment', environment, ...variables]
    if (skipDeploys) {
      args.push('--skip-deploys')
    }

    const displayArgs = redactVariables(args)
    writeLine(
      process.stdout,
      `${dryRun ? style('[dry-run] ', 'yellow') : ''}${style('railway', 'cyan')} ${displayArgs.join(' ')}`
    )

    if (dryRun) {
      continue
    }

    const env = buildRailwayEnv(environment)
    const result = await runRailway(args, { env })
    if (result !== 0) {
      failed.push({ environment, service, code: result })
    }
  }
}

if (failed.length > 0) {
  writeLine(process.stderr, style('Some commands failed:', 'red', 'bold'))
  for (const item of failed) {
    writeLine(process.stderr, style(`- env=${item.environment} service=${item.service} exit=${item.code}`, 'red'))
  }
  process.exit(1)
}

if (dryRun) {
  writeLine(process.stdout, style('Dry-run complete. No changes made.', 'green'))
} else {
  writeLine(process.stdout, style('All variables updated successfully.', 'green'))
}

function parseVariables(entries) {
  return entries.map((entry) => {
    const index = entry.indexOf('=')
    if (index <= 0) {
      printError(`Invalid variable format: "${entry}" (expected KEY=VALUE).`)
      process.exit(1)
    }
    const key = entry.slice(0, index).trim()
    const value = entry.slice(index + 1)
    if (key.length === 0) {
      printError(`Invalid variable key in: "${entry}".`)
      process.exit(1)
    }
    return { key, value }
  })
}

function normalizeEnvironment(name) {
  if (!name) return null
  const lower = name.toLowerCase()
  if (lower === 'prod') return 'production'
  if (lower === 'staging') return 'dev'
  return name
}

async function detectEnvFile(entries) {
  const candidates = []
  for (const entry of entries) {
    if (entry.includes('=')) continue
    const resolved = resolvePath(entry)
    if (entry.endsWith('.env') || (await exists(resolved))) {
      candidates.push(entry)
    }
  }

  if (candidates.length > 1) {
    printError(`Multiple .env files detected: ${candidates.join(', ')}`)
    printHelp(1)
  }

  if (candidates.length === 1) {
    const resolved = resolvePath(candidates[0])
    if (!(await exists(resolved))) {
      printError(`Env file not found: ${candidates[0]}`)
      process.exit(1)
    }
  }

  return candidates[0] ?? null
}

async function loadEnvFile(filePath) {
  const resolved = resolvePath(filePath)
  if (!(await exists(resolved))) {
    printError(`Env file not found: ${filePath}`)
    process.exit(1)
  }

  const content = await fs.readFile(resolved, 'utf8')
  const lines = content.split(/\r?\n/)
  const entries = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const sanitized = line.startsWith('export ') ? line.slice(7).trim() : line
    const index = sanitized.indexOf('=')
    if (index <= 0) {
      printError(`Invalid line in ${filePath}: "${line}"`)
      process.exit(1)
    }

    const key = sanitized.slice(0, index).trim()
    let value = sanitized.slice(index + 1).trim()
    value = stripEnvQuotes(value)

    if (!key) {
      printError(`Invalid variable key in ${filePath}: "${line}"`)
      process.exit(1)
    }

    entries.push({ key, value })
  }

  return entries
}

function stripEnvQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    const inner = value.slice(1, -1)
    return inner.replace(/\\n/g, '\n').replace(/\\r/g, '\r')
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1)
  }

  return value
}

function mergeVariables(envEntries, cliEntries) {
  const map = new Map()
  const apply = (entry) => {
    if (map.has(entry.key)) {
      map.delete(entry.key)
    }
    map.set(entry.key, entry.value)
  }

  envEntries.forEach(apply)
  cliEntries.forEach(apply)
  return map
}

function mapToVariables(map) {
  return Array.from(map.entries()).map(([key, value]) => `${key}=${value}`)
}

function buildSourceSummary(envCount, cliCount, envFilePath) {
  const parts = []
  if (envCount > 0 && envFilePath) {
    parts.push(`env-file=${path.basename(envFilePath)} (${envCount})`)
  }
  if (cliCount > 0) {
    parts.push(`args (${cliCount})`)
  }
  return parts.join(', ')
}

function buildPlanRows(environments, variableKeys) {
  const variableList = formatKeys(variableKeys)
  const rows = []
  for (const environment of environments) {
    for (const service of SERVICES) {
      rows.push([environment, service, variableList])
    }
  }
  return rows
}

function formatKeys(keys) {
  if (keys.length === 0) return '(none)'
  const previewLimit = 6
  const preview = keys.slice(0, previewLimit)
  let text = preview.join(', ')
  if (keys.length > preview.length) {
    text += ` (+${keys.length - preview.length} more)`
  }
  return text
}

async function getAllEnvironments() {
  const result = await runRailwayJson(['status', '--json'])
  const edges = result?.environments?.edges ?? []
  const names = edges
    .map((edge) => edge?.node)
    .filter((node) => node && node.canAccess !== false)
    .map((node) => node.name)
    .filter(Boolean)

  return Array.from(new Set(names)).sort()
}

function buildRailwayEnv(environment) {
  const env = { ...process.env }
  const upper = environment.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const envToken = env[`RAILWAY_TOKEN_${upper}`]
  const envApiToken = env[`RAILWAY_API_TOKEN_${upper}`]

  if (envToken) {
    env.RAILWAY_TOKEN = envToken
  }

  if (envApiToken) {
    env.RAILWAY_API_TOKEN = envApiToken
  }

  return env
}

function redactVariables(args) {
  return args.map((arg) => {
    const index = arg.indexOf('=')
    if (index <= 0) return arg
    return `${arg.slice(0, index)}=***`
  })
}

function runRailway(args, { env } = {}) {
  return new Promise((resolve) => {
    const child = spawn('railway', args, {
      stdio: 'inherit',
      env: env ?? process.env,
    })

    child.on('error', () => resolve(1))
    child.on('close', (code) => resolve(code ?? 1))
  })
}

function runRailwayJson(args) {
  return new Promise((resolve) => {
    const child = spawn('railway', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      printError(error.message)
      process.exit(1)
    })

    child.on('close', (code) => {
      if (code !== 0) {
        printError('railway status --json failed.')
        if (stderr.trim()) {
          writeLine(process.stderr, stderr.trim())
        }
        process.exit(code ?? 1)
      }

      try {
        const json = JSON.parse(stdout)
        resolve(json)
      } catch (error) {
        printError('Failed to parse railway status JSON.')
        process.exit(1)
      }
    })
  })
}

async function ensureRailwayInstalled() {
  return new Promise((resolve) => {
    const child = spawn('railway', ['--version'], { stdio: 'ignore' })
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        printError('Railway CLI not found in PATH.')
        writeLine(process.stderr, `Install it: ${DOCS_URL}`)
        process.exit(1)
      }

      printError(`Failed to run railway: ${error.message}`)
      writeLine(process.stderr, `Docs: ${DOCS_URL}`)
      process.exit(1)
    })

    child.on('close', (code) => {
      if (code !== 0) {
        printError('Railway CLI is not responding as expected.')
        writeLine(process.stderr, `Docs: ${DOCS_URL}`)
        process.exit(code ?? 1)
      }
      resolve()
    })
  })
}

async function requireApproval({ yes, dryRun }) {
  if (yes) {
    writeLine(process.stdout, style('Approval: skipped (--yes).', 'green'))
    return
  }

  if (!process.stdin.isTTY) {
    printError('No TTY available for approval prompt. Use --yes to continue.')
    process.exit(1)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(style('Proceed with these updates? (y/N) ', 'yellow'))
  rl.close()

  const normalized = answer.trim().toLowerCase()
  if (normalized !== 'y' && normalized !== 'yes') {
    writeLine(process.stdout, style(dryRun ? 'Dry-run cancelled.' : 'Aborted.', 'yellow'))
    process.exit(1)
  }
}

function renderTable(headers, rows) {
  const widths = headers.map((header, index) => {
    const column = rows.map((row) => String(row[index] ?? ''))
    return Math.max(header.length, ...column.map((value) => value.length))
  })

  const divider = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`
  const formatRow = (row, formatCell) =>
    `|${row
      .map((cell, index) => {
        const value = String(cell ?? '').padEnd(widths[index])
        const formatted = formatCell ? formatCell(value, index) : value
        return ` ${formatted} `
      })
      .join('|')}|`

  writeLine(process.stdout, divider)
  writeLine(
    process.stdout,
    formatRow(headers, (value) => style(value, 'bold'))
  )
  writeLine(process.stdout, divider)
  rows.forEach((row) => writeLine(process.stdout, formatRow(row)))
  writeLine(process.stdout, divider)
}

function printSummary({ environments, variables, sources, skipDeploys, dryRun }) {
  const summary = [
    `Environments: ${environments.join(', ')}`,
    `Services: ${SERVICES.join(', ')}`,
    `Variables: ${variables.length} key(s)`,
  ]

  if (sources) summary.push(`Sources: ${sources}`)
  if (skipDeploys) summary.push('Skip deploys: yes')
  if (dryRun) summary.push('Mode: dry-run')

  summary.forEach((line) => writeLine(process.stdout, style(line, 'dim')))
}

function printHelp(code) {
  writeLine(process.stdout, HELP_TEXT.trim())
  process.exit(code)
}

function printError(message) {
  writeLine(process.stderr, style(`Error: ${message}`, 'red'))
}

function printHeader(text) {
  writeLine(process.stdout, style(text, 'cyan', 'bold'))
}

function style(text, ...styles) {
  if (!useColor) return text

  const codes = styles.map((name) => {
    switch (name) {
      case 'bold':
        return '\x1b[1m'
      case 'dim':
        return '\x1b[2m'
      case 'red':
        return '\x1b[31m'
      case 'green':
        return '\x1b[32m'
      case 'yellow':
        return '\x1b[33m'
      case 'cyan':
        return '\x1b[36m'
      default:
        return ''
    }
  })

  return `${codes.join('')}${text}\x1b[0m`
}

function writeLine(stream, message) {
  stream.write(`${message}\n`)
}

function resolvePath(value) {
  return path.resolve(process.cwd(), value)
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
