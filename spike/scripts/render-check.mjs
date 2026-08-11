// Exit criterion (a): a real folder renders as a canvas in the STOCK frontend.
// Injects the auth bearer into localStorage, navigates to /app/w/<workspace>,
// waits for real ReactFlow canvas nodes, asserts on node content, screenshots.
//
// Run from frontend/ so @playwright/test + chromium resolve.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const FRONTEND_PORT = process.env.SPIKE_FRONTEND_PORT || '5199'
const WORKSPACE_URL_ID = process.env.SPIKE_WS_URL_ID || '4a7c1e9b2d6f4b3a9c1e000000000001'
const TOKEN_KEY = process.env.SPIKE_TOKEN_KEY || 'auth_token'
const ARTIFACTS = process.env.SPIKE_ARTIFACTS || path.resolve('../spike/artifacts')
const BASE = `http://localhost:${FRONTEND_PORT}/app`
const URL = `${BASE}/w/${WORKSPACE_URL_ID}`

fs.mkdirSync(ARTIFACTS, { recursive: true })

const consoleLines = []
const netErrors = []

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })

  // Inject the bearer token before any app script runs (AuthProvider reads it
  // from localStorage on init). Any non-empty value works: the stub /auth/me
  // accepts any bearer.
  await context.addInitScript(
    ([key, val]) => {
      window.localStorage.setItem(key, val)
    },
    [TOKEN_KEY, 'spike-bearer-token']
  )

  const page = await context.newPage()
  page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`))
  page.on('requestfailed', (req) => netErrors.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`))
  page.on('response', (res) => {
    if (res.status() >= 400) netErrors.push(`${res.status()} ${res.request().method()} ${res.url()}`)
  })

  console.log(`[render-check] navigating to ${URL}`)
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  let ok = true
  let nodeCount = 0
  let nodeTexts = []
  try {
    // Wait for the render gate (hasInitiallySynced + store.root) to resolve into
    // actual ReactFlow nodes.
    await page.waitForSelector('.react-flow__node', { timeout: 35000 })
    // Give the canvas a beat to lay out all nodes + fit view.
    await page.waitForTimeout(2500)
    const handles = await page.$$('.react-flow__node')
    nodeCount = handles.length
    for (const h of handles) {
      const t = (await h.innerText()).trim().replace(/\s+/g, ' ').slice(0, 80)
      if (t) nodeTexts.push(t)
    }
  } catch (err) {
    ok = false
    console.error('[render-check] node wait failed:', err.message)
  }

  await page.screenshot({ path: path.join(ARTIFACTS, 'a-root-canvas.png'), fullPage: false })

  // Content assertion: root canvas must show the seeded top-level items.
  const pageText = await page.evaluate(() => document.body.innerText)
  const expectedFragments = ['expedition', 'readme', 'writing', 'media', 'reference']
  const found = expectedFragments.filter((f) => pageText.toLowerCase().includes(f))

  fs.writeFileSync(path.join(ARTIFACTS, 'a-console.log'), consoleLines.join('\n'))
  fs.writeFileSync(path.join(ARTIFACTS, 'a-net-errors.log'), netErrors.join('\n'))

  console.log(`[render-check] react-flow nodes: ${nodeCount}`)
  console.log(`[render-check] node texts: ${JSON.stringify(nodeTexts)}`)
  console.log(`[render-check] expected fragments found: ${JSON.stringify(found)} / ${JSON.stringify(expectedFragments)}`)

  const pass = ok && nodeCount >= 3 && found.length >= 3
  console.log(`[render-check] RESULT: ${pass ? 'PASS' : 'FAIL'}`)

  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[render-check] fatal:', err)
  process.exit(1)
})
