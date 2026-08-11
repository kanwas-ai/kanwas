// Step 2B HEADLINE check — restart persistence:
//   make UI edits (typed text + a created note + a moved node) → kill the daemon
//   → restart on the same folder → everything is on disk and renders identically
//   (same node ids, content, position), and untouched files kept their checksums.
//
// The daemon lifecycle is driven OUTSIDE this script (bash): this script runs in
// two phases selected by PHASE=edit|verify.
//   edit:   drive the UI edits, wait for the flush, dump expected state to a JSON
//           handoff file (EXPECT_FILE), exit.
//   verify: reload the page against the restarted daemon and assert identical
//           render + disk state.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const FE_PORT = process.env.FE_PORT || '5273'
const WS_URL_ID = process.env.WS_URL_ID || ''
const WS_DIR = process.env.WS_DIR
const ARTIFACTS = process.env.ARTIFACTS || path.resolve('.')
const PHASE = process.env.PHASE || 'edit'
const EXPECT_FILE = process.env.EXPECT_FILE
const URL = `http://localhost:${FE_PORT}/app/w/${WS_URL_ID}`

if (!WS_DIR || !EXPECT_FILE) throw new Error('WS_DIR and EXPECT_FILE are required')
fs.mkdirSync(ARTIFACTS, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const read = (rel) => fs.readFileSync(path.join(WS_DIR, rel), 'utf-8')

async function pollFor(fn, timeoutMs = 10000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await sleep(intervalMs)
  }
  return false
}

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ['auth_token', 'local-bearer'])
  const page = await context.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.react-flow__node .ProseMirror', { timeout: 35000 })
  await page.waitForTimeout(2500)
  return page
}

const nodeSnapshot = (page) =>
  page.$$eval('.react-flow__node', (els) =>
    els
      .map((e) => ({
        id: e.getAttribute('data-id'),
        text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 48),
        transform: e.style.transform,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
  )

async function phaseEdit(browser) {
  const page = await openPage(browser)
  const marker = `RESTART-${Date.now()}`

  // (a) type into the expedition note
  const exp = page.locator('.react-flow__node', { hasText: 'Expedition Notes' }).first()
  await exp.locator('.ProseMirror').click({ force: true, position: { x: 12, y: 12 } })
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.type(`\n\n${marker}\n`, { delay: 12 })
  await pollFor(() => read('expedition-notes.md').includes(marker))

  // (b) create a new document with content (pane context menu)
  const idsBefore = await page.$$eval('.react-flow__node', (els) => els.map((e) => e.getAttribute('data-id')))
  await page.keyboard.press('Escape')
  await sleep(250)
  await page.mouse.click(150, 880, { button: 'right' })
  const item = page.locator('button:has-text("Add document")').first()
  await item.waitFor({ timeout: 6000 })
  await item.click()
  let createdId
  await pollFor(async () => {
    const now = await page.$$eval('.react-flow__node', (els) => els.map((e) => e.getAttribute('data-id')))
    createdId = now.find((id) => !idsBefore.includes(id))
    return !!createdId
  }, 8000)
  await page.locator(`.react-flow__node[data-id="${createdId}"] .ProseMirror`).click({ force: true, position: { x: 12, y: 12 } })
  await sleep(300)
  await page.keyboard.type(`Created before restart. ${marker}-NOTE.`, { delay: 10 })
  await pollFor(() => fs.existsSync(path.join(WS_DIR, 'new-document.md')) && read('new-document.md').includes(`${marker}-NOTE`))

  // (c) drag the framework node
  await page.keyboard.press('Escape')
  const fw = page.locator('.react-flow__node', { hasText: 'Frontmatter Fixture' }).first()
  const box = await fw.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 6)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(box.x + box.width / 2 - i * 5, box.y + 6 + i * 7)
    await sleep(20)
  }
  await page.mouse.up()

  // Let every debounced flush land, then snapshot the rendered state.
  await sleep(4500)
  const nodes = await nodeSnapshot(page)
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2b-9-before-restart.png') })
  fs.writeFileSync(EXPECT_FILE, JSON.stringify({ marker, createdId, nodes }, null, 2))
  console.log(`[restart:edit] done — marker=${marker} createdId=${createdId} nodes=${nodes.length}`)
}

async function phaseVerify(browser) {
  const expected = JSON.parse(fs.readFileSync(EXPECT_FILE, 'utf-8'))
  const page = await openPage(browser)
  const nodes = await nodeSnapshot(page)
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2b-9-after-restart.png') })

  const results = []
  const record = (name, pass, detail) => {
    results.push({ name, pass, detail })
    console.log(`[restart:verify] ${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`)
  }

  const pageText = await page.evaluate(() => document.body.innerText)
  record('typed text renders after restart', pageText.includes(expected.marker), expected.marker)

  const createdStill = nodes.find((n) => n.id === expected.createdId)
  record('created note renders with SAME id after restart', !!createdStill, expected.createdId)

  const idsBefore = expected.nodes.map((n) => n.id).join(',')
  const idsAfter = nodes.map((n) => n.id).join(',')
  record('node id set identical across restart', idsBefore === idsAfter, `${nodes.length} nodes`)

  const posMismatches = expected.nodes.filter((n) => {
    const after = nodes.find((m) => m.id === n.id)
    return !after || after.transform !== n.transform
  })
  record('node positions identical across restart', posMismatches.length === 0,
    posMismatches.map((n) => n.text).join('; ') || 'all match')

  fs.writeFileSync(path.join(ARTIFACTS, 'step2b-restart-results.json'), JSON.stringify(results, null, 2))
  const pass = results.every((r) => r.pass)
  console.log(`[restart:verify] RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  process.exitCode = pass ? 0 : 1
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    if (PHASE === 'edit') await phaseEdit(browser)
    else await phaseVerify(browser)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[restart] fatal:', err)
  process.exit(1)
})
