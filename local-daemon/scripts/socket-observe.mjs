// Observe the app-channel socket.io behavior over a window: log every /socket.io
// HTTP request, every websocket event (open/close/error surrogate), and console
// errors, to decide if the reconnect spam is truly silenced.
import { chromium } from '@playwright/test'

const LOGIN_URL = process.argv[2] || 'http://127.0.0.1:4300/local-login'
const WINDOW_MS = Number(process.argv[3] || '20000')

const httpReqs = []
const wsEvents = []
const consoleErrors = []

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  page.on('request', (r) => {
    if (r.url().includes('/socket.io')) httpReqs.push(`${new Date().toISOString().slice(11, 23)} ${r.method()} ${r.url().replace(/correlationId=[^&]+&?/, '')}`)
  })
  page.on('websocket', (ws) => {
    wsEvents.push(`WS-open ${ws.url()}`)
    ws.on('close', () => wsEvents.push(`WS-close ${ws.url()}`))
    ws.on('socketerror', (e) => wsEvents.push(`WS-error ${e}`))
  })
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${new Date().toISOString().slice(11, 23)} ${m.text()}`)
  })

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(WINDOW_MS)

  console.log(`--- over ${WINDOW_MS / 1000}s ---`)
  console.log(`socket.io HTTP requests: ${httpReqs.length}`)
  httpReqs.forEach((l) => console.log('  ' + l))
  console.log(`websocket events: ${wsEvents.length}`)
  wsEvents.forEach((l) => console.log('  ' + l))
  console.log(`console errors: ${consoleErrors.length}`)
  consoleErrors.forEach((l) => console.log('  ' + l))

  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
