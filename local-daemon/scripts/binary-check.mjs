// Step 2C binary-node operations — drives the STOCK frontend and asserts:
//   1. UI rename of a binary node MOVES its file on disk (bytes preserved), keeps
//      the node id, and updates storagePath in metadata.yaml.
//   2. UI delete of a binary node moves its file to .kanwas/trash/.
//   3. External replacement (same path, new bytes) refreshes the node (contentHash
//      changes) and it still renders.
//
// Env: FE_PORT, WS_URL_ID, WS_DIR, ARTIFACTS.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const FE_PORT = process.env.FE_PORT || '5273'
const WS_URL_ID = process.env.WS_URL_ID || ''
const WS_DIR = process.env.WS_DIR
const ARTIFACTS = process.env.ARTIFACTS || path.resolve('.')
const URL = `http://localhost:${FE_PORT}/app/w/${WS_URL_ID}`
if (!WS_DIR) throw new Error('WS_DIR is required')

// Two DISTINCT 1x1 PNGs (different bytes → different contentHash).
const PNG_A = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
)
const PNG_B = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4z8AAAAMBAQDXB1M5AAAAAElFTkSuQmCC',
  'base64'
)

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`[binary] ${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const meta = () => fs.readFileSync(path.join(WS_DIR, 'metadata.yaml'), 'utf-8')

async function pollFor(fn, timeoutMs = 12000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await sleep(intervalMs)
  }
  return false
}

/** Extract a node's id and contentHash for a given storagePath from metadata.yaml. */
function nodeByStoragePath(storagePath) {
  const chunks = meta().split(/\n(?=  - id:)/)
  const chunk = chunks.find((c) => c.includes(`storagePath: ${storagePath}`))
  if (!chunk) return null
  return {
    id: chunk.match(/id: ([0-9a-f-]+)/)?.[1],
    contentHash: chunk.match(/contentHash: ([0-9a-f]+)/)?.[1],
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ['auth_token', 'local-bearer'])
  const page = await context.newPage()
  const consoleLines = []
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`))

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.react-flow__node .ProseMirror', { timeout: 35000 })
  await page.waitForTimeout(2500)

  // --- 1. Rename the image node → file move, id stable ---
  const before = nodeByStoragePath('uploaded-photo.png')
  const imgNode = page.locator('.react-flow__node:has(img)').first()
  await imgNode.locator('span.truncate').first().dblclick({ force: true })
  const input = page.locator('input[placeholder="Document name..."]')
  await input.waitFor({ timeout: 5000 })
  const beforeBytes = fs.readFileSync(path.join(WS_DIR, 'uploaded-photo.png'))
  await input.fill('renamed shot')
  await input.press('Enter')
  const moved = await pollFor(
    () => !fs.existsSync(path.join(WS_DIR, 'uploaded-photo.png')) && fs.existsSync(path.join(WS_DIR, 'renamed-shot.png'))
  )
  await sleep(1500)
  const after = nodeByStoragePath('renamed-shot.png')
  const bytesPreserved = moved && fs.readFileSync(path.join(WS_DIR, 'renamed-shot.png')).equals(beforeBytes)
  const idStable = !!before?.id && before.id === after?.id
  record('binary rename → file moved, bytes preserved, id stable',
    moved && bytesPreserved && idStable,
    `uploaded-photo.png → renamed-shot.png, id ${before?.id?.slice(0, 8)} ${idStable ? '==' : '!='} ${after?.id?.slice(0, 8)}`)

  // --- 2. External replacement of the image (same path, new bytes) → contentHash refresh ---
  const hashBefore = nodeByStoragePath('renamed-shot.png')?.contentHash
  fs.writeFileSync(path.join(WS_DIR, 'renamed-shot.png'), PNG_B)
  const hashChanged = await pollFor(() => {
    const h = nodeByStoragePath('renamed-shot.png')?.contentHash
    return h && h !== hashBefore
  })
  await sleep(800)
  const stillRenders = (await page.$$eval('.react-flow__node img', (els) => els.length)) > 0
  record('external binary replace → node contentHash refreshed',
    hashChanged && stillRenders,
    `hash ${hashBefore?.slice(0, 8)} → ${nodeByStoragePath('renamed-shot.png')?.contentHash?.slice(0, 8)}`)

  // --- 3. Delete the file node (dataset.csv) → trash ---
  const csvNode = page.locator('.react-flow__node', { hasText: 'dataset.csv' }).first()
  await csvNode.click({ force: true, position: { x: 8, y: 8 } })
  await sleep(300)
  await page.keyboard.press('Backspace')
  const confirmBtn = page.locator('button:has-text("Delete")').first()
  await confirmBtn.waitFor({ timeout: 5000 }).catch(() => {})
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click()
  const trashDir = path.join(WS_DIR, '.kanwas', 'trash')
  const trashed = await pollFor(() => {
    if (fs.existsSync(path.join(WS_DIR, 'dataset.csv'))) return false
    if (!fs.existsSync(trashDir)) return false
    return fs.readdirSync(trashDir).some((s) => fs.existsSync(path.join(trashDir, s, 'dataset.csv')))
  })
  record('binary delete → file moved to .kanwas/trash', trashed, `dataset.csv trashed=${trashed}`)

  await page.screenshot({ path: path.join(ARTIFACTS, 'step2c-2-binary-ops.png') })
  fs.writeFileSync(path.join(ARTIFACTS, 'step2c-binary-console.log'), consoleLines.join('\n'))
  fs.writeFileSync(path.join(ARTIFACTS, 'step2c-binary-results.json'), JSON.stringify(results, null, 2))
  const pass = results.every((r) => r.pass)
  console.log(`[binary] RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[binary] fatal:', err)
  process.exit(1)
})
