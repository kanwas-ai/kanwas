import { exec } from 'child_process'
import chalk from 'chalk'
import { writeGlobalConfig } from '../config.js'

function defaultFrontendUrl(backendUrl: string): string {
  if (backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1')) {
    return 'http://localhost:5173'
  }
  return 'https://kanwas.ai/app'
}

function defaultYjsServerHost(backendUrl: string): string {
  if (backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1')) {
    return 'localhost:1999'
  }

  if (backendUrl.includes('staging-api.kanwas.ai')) {
    return 'staging-yjs.kanwas.ai'
  }

  if (backendUrl.includes('seo-api.kanwas.ai')) {
    return 'seo-yjs.kanwas.ai'
  }

  return 'yjs.kanwas.ai'
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'

  exec(`${command} ${JSON.stringify(url)}`, (err) => {
    if (err) {
      console.log(chalk.yellow(`Could not open browser. Please visit:\n${url}`))
    }
  })
}

async function pollForAuth(
  backendUrl: string,
  code: string,
  timeoutMs: number = 300_000
): Promise<{ token: string; user: { name: string; email: string } }> {
  const deadline = Date.now() + timeoutMs
  const interval = 2000

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval))

    const res = await fetch(`${backendUrl}/auth/cli/poll?code=${encodeURIComponent(code)}`)

    if (res.status === 404) {
      throw new Error('Authorization code expired. Please try again.')
    }

    if (!res.ok) {
      throw new Error(`Polling failed: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as {
      status: string
      token?: string
      user?: { name: string; email: string }
    }

    if (data.status === 'approved' && data.token && data.user) {
      return { token: data.token, user: data.user }
    }
  }

  throw new Error('Authorization timed out. Please try again.')
}

export interface LoginOptions {
  apiUrl?: string
  frontendUrl?: string
  yjsServerHost?: string
}

export async function loginCommand(opts: LoginOptions = {}): Promise<void> {
  console.log(chalk.bold('\nKanwas CLI Login\n'))

  const backendUrl = opts.apiUrl || 'https://api.kanwas.ai'
  const frontendUrl = opts.frontendUrl || defaultFrontendUrl(backendUrl)
  const yjsServerHost = opts.yjsServerHost || defaultYjsServerHost(backendUrl)

  if (opts.apiUrl) {
    console.log(chalk.dim(`Backend:  ${backendUrl}`))
    console.log(chalk.dim(`Frontend: ${frontendUrl}`))
    console.log(chalk.dim(`Yjs server: ${yjsServerHost}`))
  }

  // Request auth code from backend
  console.log(chalk.dim('Requesting authorization code...'))
  const codeRes = await fetch(`${backendUrl}/auth/cli/code`, { method: 'POST' })

  if (!codeRes.ok) {
    console.error(chalk.red(`Failed to get auth code: ${codeRes.status} ${codeRes.statusText}`))
    process.exit(1)
  }

  const { code } = (await codeRes.json()) as { code: string; expiresIn: number }

  // Open browser for authorization
  const authUrl = `${frontendUrl}/cli/authorize?code=${code}`
  console.log(chalk.dim('Opening browser for authorization...'))
  openBrowser(authUrl)

  console.log(`\nIf the browser didn't open, visit:\n${chalk.cyan(authUrl)}\n`)
  console.log(chalk.dim('Waiting for authorization...'))

  // Poll for auth result
  const { token: authToken, user } = await pollForAuth(backendUrl, code)

  console.log(chalk.green(`\nAuthenticated as ${user.name} (${user.email})`))

  await writeGlobalConfig({ backendUrl, frontendUrl, yjsServerHost, authToken })

  console.log(chalk.dim('Config saved to ~/.kanwas/config.json'))
  console.log(chalk.dim('\nRun "kanwas pull" to download a workspace.'))
}
