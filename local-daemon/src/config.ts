import path from 'node:path'
import { LOCAL_AUTH_TOKEN_KEY } from './identity.js'
import { WEB_DIST_DIR } from './paths.js'

export interface DaemonConfig {
  /**
   * Absolute path to a folder to mount on top of whatever the persistent vault
   * registry (`~/.kanwas/vaults.json`) already remembers. OPTIONAL since Phase
   * 2 — the daemon can boot from the registry alone (see index.ts); index.ts
   * is responsible for erroring out if neither this nor the registry yields a
   * mountable vault.
   */
  folder?: string
  /** REST/API port (frontend's VITE_API_URL points here). */
  restPort: number
  /** Yjs socket.io port (frontend's VITE_YJS_SERVER_URL points here). */
  yjsPort: number
  /** Bind host. */
  host: string
  /** pino log level. */
  logLevel: string
  /** Force pretty logs. */
  pretty: boolean
  /** Built frontend bundle the daemon serves under `/app/` (vite `--mode kanwasup` output). */
  webDist: string
  /** localStorage key the `/local-login` page writes the token to. */
  tokenKey: string
  /**
   * When set, the daemon publishes its single-instance record here on startup and
   * removes it on shutdown. The `kanwas` launcher passes `~/.kanwas/daemon.json`;
   * bare `node dist/index.js …` runs omit it and stay untracked.
   */
  instanceFile?: string
}

const DEFAULTS = {
  restPort: 4300,
  yjsPort: 1999,
  host: '127.0.0.1',
  logLevel: 'info',
}

function usage(): string {
  return [
    'kanwasd — serve a local folder as a Kanwas workspace',
    '',
    'Usage:',
    '  kanwasd [--folder <path>] [--port <restPort>] [--yjs-port <port>] [--host <host>]',
    '',
    'Options:',
    `  --folder <path>       Folder to mount, in addition to the registry (~/.kanwas/vaults.json).`,
    `                         Optional if the registry has at least one mountable vault.`,
    `  --port <n>            REST/API port (default ${DEFAULTS.restPort})`,
    `  --yjs-port <n>        Yjs socket port (default ${DEFAULTS.yjsPort})`,
    `  --host <host>         Bind host (default ${DEFAULTS.host})`,
    `  --log-level <level>   pino level: debug|info|warn|error (default ${DEFAULTS.logLevel})`,
    `  --pretty              Force pretty logs`,
    `  --web-dist <path>     Built frontend bundle to serve under /app/ (default local-daemon/web-dist)`,
    `  --token-key <key>     localStorage key for the local-login token (default ${LOCAL_AUTH_TOKEN_KEY})`,
    `  --instance-file <p>   Publish a single-instance record here (used by the \`kanwas\` launcher)`,
  ].join('\n')
}

/** Parse argv (and a few env fallbacks) into a validated DaemonConfig. */
export function parseConfig(argv: string[]): DaemonConfig {
  const args = argv.slice(2)
  let folder: string | undefined = process.env.KANWAS_FOLDER
  let restPort = Number(process.env.KANWAS_PORT ?? DEFAULTS.restPort)
  let yjsPort = Number(process.env.KANWAS_YJS_PORT ?? DEFAULTS.yjsPort)
  let host = process.env.KANWAS_HOST ?? DEFAULTS.host
  let logLevel = process.env.LOG_LEVEL ?? DEFAULTS.logLevel
  let pretty = false
  let webDist = process.env.KANWAS_WEB_DIST ?? WEB_DIST_DIR
  let tokenKey = process.env.KANWAS_TOKEN_KEY ?? LOCAL_AUTH_TOKEN_KEY
  let instanceFile = process.env.KANWAS_INSTANCE_FILE

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = () => {
      const value = args[i + 1]
      if (value === undefined) {
        throw new Error(`Missing value for ${arg}`)
      }
      i++
      return value
    }
    switch (arg) {
      case '--folder':
      case '-f':
        folder = next()
        break
      case '--port':
      case '-p':
        restPort = Number(next())
        break
      case '--yjs-port':
        yjsPort = Number(next())
        break
      case '--host':
        host = next()
        break
      case '--log-level':
        logLevel = next()
        break
      case '--pretty':
        pretty = true
        break
      case '--web-dist':
        webDist = next()
        break
      case '--token-key':
        tokenKey = next()
        break
      case '--instance-file':
        instanceFile = next()
        break
      case '--help':
      case '-h':
        console.log(usage())
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}\n\n${usage()}`)
    }
  }

  if (!Number.isFinite(restPort) || restPort <= 0) {
    throw new Error(`Invalid --port`)
  }
  if (!Number.isFinite(yjsPort) || yjsPort <= 0) {
    throw new Error(`Invalid --yjs-port`)
  }
  if (restPort === yjsPort) {
    throw new Error('--port and --yjs-port must differ (the frontend opens separate REST and socket connections)')
  }

  return {
    folder: folder ? path.resolve(folder) : undefined,
    restPort,
    yjsPort,
    host,
    logLevel,
    pretty,
    webDist: path.resolve(webDist),
    tokenKey,
    instanceFile: instanceFile ? path.resolve(instanceFile) : undefined,
  }
}
