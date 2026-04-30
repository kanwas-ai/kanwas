import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// --- Global config: ~/.kanwas/config.json ---

export interface GlobalConfig {
  backendUrl: string
  frontendUrl: string
  yjsServerHost: string
  authToken: string
}

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.kanwas')
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, 'config.json')

export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG_FILE
}

export async function readGlobalConfig(): Promise<GlobalConfig> {
  try {
    const content = await fs.readFile(GLOBAL_CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(content) as Partial<GlobalConfig>

    if (!parsed.backendUrl || !parsed.frontendUrl || !parsed.authToken || !parsed.yjsServerHost) {
      throw new Error('Global config is missing required fields. Run "kanwas login" again.')
    }

    return {
      authToken: parsed.authToken,
      backendUrl: parsed.backendUrl,
      frontendUrl: parsed.frontendUrl,
      yjsServerHost: parsed.yjsServerHost,
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      throw new Error('Not authenticated. Run "kanwas login" first.')
    }
    throw error
  }
}

export async function writeGlobalConfig(config: GlobalConfig): Promise<void> {
  await fs.mkdir(GLOBAL_CONFIG_DIR, { recursive: true })
  await fs.writeFile(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

// --- Local config: .kanwas.json in project directory ---

export interface LocalConfig {
  workspaceId: string
  workspaceName: string
  snapshot?: Record<string, string> // path → content hash from last pull
  ignore?: string[] // glob patterns to exclude from push/pull
}

const LOCAL_CONFIG_FILENAME = '.kanwas.json'

export function getLocalConfigPath(dir: string = process.cwd()): string {
  return path.join(dir, LOCAL_CONFIG_FILENAME)
}

export async function readLocalConfig(dir: string = process.cwd()): Promise<LocalConfig> {
  const configPath = getLocalConfigPath(dir)
  try {
    const content = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(content) as LocalConfig
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      throw new Error(`No ${LOCAL_CONFIG_FILENAME} found. Run "kanwas pull" first.`)
    }
    throw error
  }
}

export async function tryReadLocalConfig(dir: string = process.cwd()): Promise<LocalConfig | null> {
  try {
    return await readLocalConfig(dir)
  } catch {
    return null
  }
}

export async function writeLocalConfig(config: LocalConfig, dir: string = process.cwd()): Promise<void> {
  const configPath = getLocalConfigPath(dir)
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
