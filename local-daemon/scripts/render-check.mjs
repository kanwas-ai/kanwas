// Headless render check for kanwasd: navigate the STOCK frontend to the served
// workspace, wait for real ReactFlow nodes, assert content, screenshot.
//
// Run from frontend/ (so @playwright/test resolves). Parameterized by env:
//   FE_PORT, WS_URL_ID, TOKEN_KEY, ARTIFACTS, SHOT, MIN_NODES, FRAGMENTS
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const FE_PORT = process.env.FE_PORT || '5273'
const WS_URL_ID = process.env.WS_URL_ID || ''
const TOKEN_KEY = process.env.TOKEN_KEY || 'auth_token'
const ARTIFACTS = process.env.ARTIFACTS || path.resolve('.')
const SHOT = process.env.SHOT || 'render.png'
const MIN_NODES = Number(process.env.MIN_NODES || '3')
const FRAGMENTS = (process.env.FRAGMENTS || '').split(',').map((s) => s.trim()).filter(Boolean)
const MIN_FRAGMENTS = Number(process.env.MIN_FRAGMENTS || String(Math.min(3, FRAGMENTS.length)))
const URL = `http://localhost:${FE_PORT}/app/w/${WS_URL_ID}`

fs.mkdirSync(ARTIFACTS, { recursive: true })
const consoleLines = []
const netErrors = []

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.addInitScript(([key, val]) => window.localStorage.setItem(key, val), [TOKEN_KEY, 'local-bearer'])

  const page = await context.newPage()
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`))
  page.on('requestfailed', (r) => netErrors.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`))
  page.on('response', (r) => {
    if (r.status() >= 400) netErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })

  console.log(`[render-check] navigating to ${URL}`)
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  let ok = true
  let nodeCount = 0
  const nodeTexts = []
  try {
    if (MIN_NODES > 0) {
      await page.waitForSelector('.react-flow__node', { timeout: 35000 })
    } else {
      await page.waitForSelector('.react-flow', { timeout: 35000 })
    }
    await page.waitForTimeout(2500)
    const handles = await page.$$('.react-flow__node')
    nodeCount = handles.length
    for (const h of handles) {
      const t = (await h.innerText()).trim().replace(/\s+/g, ' ').slice(0, 80)
      if (t) nodeTexts.push(t)
    }
    if (process.env.DUMP_IDS) {
      const ids = (await page.$$eval('.react-flow__node', (els) => els.map((e) => e.getAttribute('data-id')))).sort()
      fs.writeFileSync(process.env.DUMP_IDS, ids.join('\n'))
    }
  } catch (err) {
    ok = false
    console.error('[render-check] wait failed:', err.message)
  }

  await page.screenshot({ path: path.join(ARTIFACTS, SHOT), fullPage: false })
  const pageText = await page.evaluate(() => document.body.innerText)
  const found = FRAGMENTS.filter((f) => pageText.toLowerCase().includes(f.toLowerCase()))

  fs.writeFileSync(path.join(ARTIFACTS, `${SHOT}.console.log`), consoleLines.join('\n'))
  fs.writeFileSync(path.join(ARTIFACTS, `${SHOT}.net-errors.log`), netErrors.join('\n'))

  console.log(`[render-check] react-flow nodes: ${nodeCount}`)
  console.log(`[render-check] node texts: ${JSON.stringify(nodeTexts.slice(0, 12))}`)
  console.log(`[render-check] fragments found: ${JSON.stringify(found)} / ${JSON.stringify(FRAGMENTS)}`)

  const hasReactFlow = await page.$('.react-flow')
  const pass = ok && nodeCount >= MIN_NODES && found.length >= MIN_FRAGMENTS && (MIN_NODES > 0 || !!hasReactFlow)
  console.log(`[render-check] RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[render-check] fatal:', err)
  process.exit(1)
})
