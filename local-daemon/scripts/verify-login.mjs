// Headless verification of the zero-console /local-login flow.
// Navigates to the daemon's /local-login with a CLEAN browser context (no
// pre-seeded localStorage), then asserts:
//   1. it redirected into /app/w/<id>
//   2. localStorage[tokenKey] got set by the page itself (no console/devtools)
//   3. the ReactFlow canvas renders real nodes
// Usage: node verify-login.mjs <loginUrl> <shotPath> [tokenKey]
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const LOGIN_URL = process.argv[2] || 'http://127.0.0.1:4300/local-login'
const SHOT = process.argv[3] || 'kanwasup-verify.png'
const TOKEN_KEY = process.argv[4] || 'auth_token'
const MIN_NODES = Number(process.env.MIN_NODES || '1')

const consoleLines = []
const netErrors = []
const socketIoHits = { requests: 0, wsFailures: 0 }

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await context.newPage()

  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`))
  page.on('requestfailed', (r) => {
    const u = r.url()
    netErrors.push(`FAIL ${r.method()} ${u} :: ${r.failure()?.errorText}`)
    if (u.includes('/socket.io')) socketIoHits.wsFailures++
  })
  page.on('request', (r) => {
    if (r.url().includes('/socket.io')) socketIoHits.requests++
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/socket.io')) {
      netErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
    }
  })

  console.log(`[verify-login] goto (clean, no pre-set token): ${LOGIN_URL}`)
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  // The login page redirects; wait for the SPA workspace route.
  await page.waitForURL(/\/app\/w\//, { timeout: 20000 })
  const landedUrl = page.url()
  console.log(`[verify-login] landed on: ${landedUrl}`)

  const tokenValue = await page.evaluate((k) => window.localStorage.getItem(k), TOKEN_KEY)
  console.log(`[verify-login] localStorage[${TOKEN_KEY}] = ${JSON.stringify(tokenValue)}`)

  let nodeCount = 0
  let ok = true
  try {
    await page.waitForSelector('.react-flow__node', { timeout: 35000 })
    await page.waitForTimeout(2500)
    nodeCount = (await page.$$('.react-flow__node')).length
  } catch (e) {
    ok = false
    console.error('[verify-login] node wait failed:', e.message)
  }

  const outDir = path.dirname(SHOT)
  fs.mkdirSync(outDir, { recursive: true })
  await page.screenshot({ path: SHOT, fullPage: false })
  fs.writeFileSync(`${SHOT}.console.log`, consoleLines.join('\n'))
  fs.writeFileSync(`${SHOT}.net-errors.log`, netErrors.join('\n'))

  const tokenSet = Boolean(tokenValue)
  const redirected = /\/app\/w\//.test(landedUrl)
  const nodesOk = nodeCount >= MIN_NODES
  const pass = ok && tokenSet && redirected && nodesOk

  console.log('[verify-login] --- results ---')
  console.log(`  redirected into /app/w/: ${redirected}`)
  console.log(`  token set by page:       ${tokenSet}`)
  console.log(`  react-flow nodes:        ${nodeCount} (>= ${MIN_NODES}: ${nodesOk})`)
  console.log(`  socket.io requests:      ${socketIoHits.requests} (ws failures: ${socketIoHits.wsFailures})`)
  console.log(`  net errors (non-sio):    ${netErrors.length}`)
  console.log(`[verify-login] RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  console.log(`[verify-login] screenshot: ${SHOT}`)

  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  console.error('[verify-login] fatal:', e)
  process.exit(1)
})
