// Live folder→canvas sync check (criterion 3), all via the daemon's OWN watcher
// (no helper clients). Opens the workspace once and, against the live page:
//   A. external .md edit  → open note updates (marker text appears)
//   B. new .md at root     → a new node appears
//   C. delete that .md     → the node disappears
//   D. new .md in a NEW subdir → a nested canvas node appears (autoCreateCanvases)
//
// Run from frontend/. Env: FE_PORT, WS_URL_ID, WS_DIR, ARTIFACTS.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const FE_PORT = process.env.FE_PORT || '5273'
const WS_URL_ID = process.env.WS_URL_ID || ''
const WS_DIR = process.env.WS_DIR
const ARTIFACTS = process.env.ARTIFACTS || path.resolve('.')
const URL = `http://localhost:${FE_PORT}/app/w/${WS_URL_ID}`

if (!WS_DIR) throw new Error('WS_DIR is required')
fs.mkdirSync(ARTIFACTS, { recursive: true })

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`[live-sync] ${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`)
}

async function pollFor(page, predicate, timeoutMs = 12000, intervalMs = 400) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await page.waitForTimeout(intervalMs)
  }
  return false
}

const bodyText = (page) => page.evaluate(() => document.body.innerText)
const nodeTexts = (page) =>
  page.$$eval('.react-flow__node', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ['auth_token', 'local-bearer'])
  const page = await context.newPage()
  const consoleLines = []
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`))
  const dumpConsole = () => fs.writeFileSync(path.join(ARTIFACTS, 'step2a-live-console.log'), consoleLines.join('\n'))

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.react-flow__node', { timeout: 35000 })
  await page.waitForTimeout(2500)
  const baseNodes = (await nodeTexts(page)).length
  console.log(`[live-sync] baseline nodes: ${baseNodes}`)

  // --- A. external edit propagates into the open note ---
  const marker = `LIVEEDIT-${Date.now()}`
  const expedition = path.join(WS_DIR, 'expedition-notes.md')
  const original = fs.readFileSync(expedition, 'utf-8')
  const base = original.split('\n\n## Live sync marker\n')[0]
  fs.writeFileSync(expedition, `${base.trimEnd()}\n\n## Live sync marker\n\n${marker}\n`, 'utf-8')
  const aOk = await pollFor(page, async () => (await bodyText(page)).includes(marker))
  record('A external .md edit → open note updates', aOk, marker)
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2a-live-A-edit.png') })

  // --- B. new .md at root → new node appears ---
  const rootFile = path.join(WS_DIR, 'live-root.md')
  fs.writeFileSync(rootFile, '# Live Root\n\nCreated live by the watcher.\n', 'utf-8')
  const bOk = await pollFor(page, async () => (await nodeTexts(page)).some((t) => /live[- ]?root/i.test(t)))
  record('B new .md at root → node appears', bOk, `nodes ${baseNodes}→${(await nodeTexts(page)).length}`)

  // --- C. delete that .md → node disappears ---
  fs.rmSync(rootFile)
  const cOk = await pollFor(page, async () => !(await nodeTexts(page)).some((t) => /live[- ]?root/i.test(t)))
  record('C delete .md → node removed', cOk)

  // --- D. new .md in a NEW subdir → nested canvas node appears ---
  const subDir = path.join(WS_DIR, 'livedir')
  fs.mkdirSync(subDir, { recursive: true })
  fs.writeFileSync(path.join(subDir, 'deep.md'), '# Deep Note\n\nInside a brand-new nested canvas.\n', 'utf-8')
  const dOk = await pollFor(page, async () => (await nodeTexts(page)).some((t) => /livedir/i.test(t)))
  record('D new .md in NEW subdir → nested canvas node appears', dOk)
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2a-live-D-nested.png') })

  // cleanup live artifacts from the folder
  fs.rmSync(subDir, { recursive: true, force: true })

  dumpConsole()
  fs.writeFileSync(path.join(ARTIFACTS, 'step2a-live-results.json'), JSON.stringify(results, null, 2))
  const pass = results.every((r) => r.pass)
  console.log(`[live-sync] RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[live-sync] fatal:', err)
  process.exit(1)
})
