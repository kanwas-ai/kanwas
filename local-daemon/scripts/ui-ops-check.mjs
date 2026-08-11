// Step 2B UI-operations verification — drives the STOCK frontend and asserts the
// flusher's structural reconcile on disk:
//   3. UI note creation → new .md (with content) in the right dir; sticky/text/link
//      → correct metadata.yaml entries (+ .sticky.yaml file for sticky).
//   4. Drag a node → metadata.yaml position updates, debounced (one write per
//      settle, not per pixel).
//   5. Rename a node in the UI → file renamed on disk, same node id.
//   6. Delete a node in the UI → backing file lands in .kanwas/trash/.
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
fs.mkdirSync(ARTIFACTS, { recursive: true })

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`[ui-ops] ${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const read = (rel) => fs.readFileSync(path.join(WS_DIR, rel), 'utf-8')
const meta = () => read('metadata.yaml')

async function pollFor(fn, timeoutMs = 10000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await sleep(intervalMs)
  }
  return false
}

/** Find a viewport point on the pane not covered by any node (for pane right-clicks). */
async function findEmptyPaneSpot(page) {
  const boxes = await page.$$eval('.react-flow__node', (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })
  )
  const candidates = []
  for (let x = 120; x <= 1480; x += 80) for (let y = 120; y <= 880; y += 80) candidates.push({ x, y })
  const clear = (p) => boxes.every((b) => p.x < b.x - 30 || p.x > b.x + b.w + 30 || p.y < b.y - 30 || p.y > b.y + b.h + 30)
  return candidates.find(clear) ?? { x: 100, y: 850 }
}

/** Right-click an empty pane spot and click a context-menu item by label. */
async function addViaContextMenu(page, label) {
  await page.keyboard.press('Escape') // clear any selection/editing state
  await sleep(250)
  const spot = await findEmptyPaneSpot(page)
  await page.mouse.click(spot.x, spot.y, { button: 'right' })
  const item = page.locator(`button:has-text("${label}")`).first()
  await item.waitFor({ timeout: 6000 })
  await item.click()
  await sleep(400)
  return spot
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

  const mdBefore = fs.readdirSync(WS_DIR).filter((f) => f.endsWith('.md'))
  const nodeIds = () => page.$$eval('.react-flow__node', (els) => els.map((e) => e.getAttribute('data-id')))

  // --- Criterion 3a: Add document → new .md with content ---
  const idsBeforeDoc = await nodeIds()
  await addViaContextMenu(page, 'Add document')
  let newDocId
  await pollFor(async () => {
    const now = await nodeIds()
    newDocId = now.find((id) => !idsBeforeDoc.includes(id))
    return !!newDocId
  }, 8000)
  const newDoc = page.locator(`.react-flow__node[data-id="${newDocId}"]`)
  await newDoc.locator('.ProseMirror').click({ force: true, position: { x: 12, y: 12 } })
  await sleep(300)
  await page.keyboard.type('Created from the UI. CREATE-MARKER.', { delay: 10 })
  const c3a = await pollFor(() => {
    const now = fs.readdirSync(WS_DIR).filter((f) => f.endsWith('.md'))
    const added = now.filter((f) => !mdBefore.includes(f))
    return added.some((f) => read(f).includes('CREATE-MARKER'))
  })
  const newMd = fs.readdirSync(WS_DIR).filter((f) => f.endsWith('.md') && !mdBefore.includes(f))
  record('3a UI note creation → new .md with content', c3a, `file=${newMd.join(',')}`)

  // --- Criterion 3b: Add sticky note → metadata entry + .sticky.yaml ---
  const idsBeforeSticky = await nodeIds()
  await addViaContextMenu(page, 'Add sticky note')
  let stickyId
  await pollFor(async () => {
    const now = await nodeIds()
    stickyId = now.find((id) => !idsBeforeSticky.includes(id))
    return !!stickyId
  }, 8000)
  const sticky = page.locator(`.react-flow__node[data-id="${stickyId}"]`)
  await sticky.locator('.ProseMirror').click({ force: true, position: { x: 20, y: 20 } }).catch(() => {})
  await sleep(300)
  await page.keyboard.type('sticky says hi', { delay: 10 })
  const c3b = await pollFor(() => {
    const stickyFiles = fs.readdirSync(WS_DIR).filter((f) => f.endsWith('.sticky.yaml'))
    return meta().includes('stickyNote') && stickyFiles.some((f) => read(f).includes('sticky says hi'))
  })
  record('3b sticky note → metadata + .sticky.yaml with content', c3b,
    fs.readdirSync(WS_DIR).filter((f) => f.endsWith('.sticky.yaml')).join(','))

  // --- Criterion 3c: Add text → metadata entry with content ---
  await addViaContextMenu(page, 'Add text')
  // New text node is created with default content 'Text' (metadata-only node).
  const c3c = await pollFor(() => /type: text\b/.test(meta()) && /content: Text\b/.test(meta()))
  record('3c text node → metadata.yaml entry', c3c)

  // --- Criterion 3d: Add link → metadata entry with url ---
  await addViaContextMenu(page, 'Add link')
  const urlInput = page.locator('input[placeholder="https://example.com"]')
  await urlInput.waitFor({ timeout: 5000 })
  await urlInput.fill('https://example.com/step2b')
  await urlInput.press('Enter')
  const c3d = await pollFor(() => meta().includes('https://example.com/step2b'))
  record('3d link node → metadata.yaml entry', c3d)
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2b-3-create.png') })

  // --- Criterion 4: drag a node → debounced position write ---
  const expedition = page.locator('.react-flow__node', { hasText: 'Expedition Notes' }).first()
  const box = await expedition.boundingBox()
  const metaPath = path.join(WS_DIR, 'metadata.yaml')
  let metaWrites = 0
  let lastM = fs.statSync(metaPath).mtimeMs
  let sampling = true
  const sampler = (async () => {
    while (sampling) {
      const m = fs.statSync(metaPath).mtimeMs
      if (m !== lastM) { metaWrites++; lastM = m }
      await sleep(100)
    }
  })()
  const posBefore = /position:[\s\S]*?/.test(meta()) ? meta() : ''
  // Grab the node by its top drag area and drag in many small steps.
  await page.mouse.move(box.x + box.width / 2, box.y + 6)
  await page.mouse.down()
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(box.x + box.width / 2 + i * 6, box.y + 6 + i * 4)
    await sleep(25)
  }
  await page.mouse.up()
  const c4moved = await pollFor(() => meta() !== posBefore, 8000)
  await sleep(3500) // settle
  sampling = false
  await sampler
  const c4bounded = metaWrites >= 1 && metaWrites <= 3
  record('4 drag → metadata position updates, debounced', c4moved && c4bounded, `metadata writes=${metaWrites}`)
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2b-4-drag.png') })

  // --- Criterion 5: rename a node → file renamed, same id ---
  const idOfReadmeBefore = (() => {
    const m = meta()
    // find the node whose name is readme and capture its id (yaml: "- id: X" ... "name: readme")
    const entry = m.split(/\n(?=  - id:)/).find((chunk) => /name: readme\b/.test(chunk))
    return entry?.match(/id: ([0-9a-f-]+)/)?.[1]
  })()
  const readmeNode = page.locator('.react-flow__node', { hasText: 'Field Vault' }).first()
  const nameLabel = readmeNode.locator('span.truncate', { hasText: 'readme' }).first()
  await nameLabel.dblclick({ force: true })
  const inline = page.locator('input[placeholder="Document name..."]')
  await inline.waitFor({ timeout: 5000 })
  await inline.fill('renamed readme')
  await inline.press('Enter')
  const c5renamed = await pollFor(
    () => !fs.existsSync(path.join(WS_DIR, 'README.md')) && fs.existsSync(path.join(WS_DIR, 'renamed-readme.md'))
  )
  const idOfRenamed = (() => {
    const entry = meta().split(/\n(?=  - id:)/).find((chunk) => /name: renamed readme/.test(chunk))
    return entry?.match(/id: ([0-9a-f-]+)/)?.[1]
  })()
  const idStable = !!idOfReadmeBefore && idOfReadmeBefore === idOfRenamed
  record('5 UI rename → file renamed, id stable', c5renamed && idStable,
    `README.md → renamed-readme.md, id ${idOfReadmeBefore} ${idStable ? '==' : '!='} ${idOfRenamed}`)
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2b-5-rename.png') })

  // --- Criterion 6: delete a node → file lands in .kanwas/trash ---
  // Delete the UI-created document (its .md exists on disk by now).
  const createdFile = newMd[0]
  const createdNode = page.locator('.react-flow__node', { hasText: 'CREATE-MARKER' }).first()
  await createdNode.click({ force: true, position: { x: 8, y: 8 } }) // select without entering editor
  await sleep(300)
  await page.keyboard.press('Backspace')
  const confirmBtn = page.locator('button:has-text("Delete")').first()
  await confirmBtn.waitFor({ timeout: 5000 })
  await confirmBtn.click()
  const trashDir = path.join(WS_DIR, '.kanwas', 'trash')
  const c6 = await pollFor(() => {
    if (fs.existsSync(path.join(WS_DIR, createdFile))) return false
    if (!fs.existsSync(trashDir)) return false
    return fs.readdirSync(trashDir).some((stamp) => fs.existsSync(path.join(trashDir, stamp, createdFile)))
  })
  const metaConsistent = !meta().includes('CREATE-MARKER')
  record('6 UI delete → file in .kanwas/trash, metadata consistent', c6 && metaConsistent, `file=${createdFile}`)
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2b-6-delete.png') })

  fs.writeFileSync(path.join(ARTIFACTS, 'step2b-uiops-console.log'), consoleLines.join('\n'))
  fs.writeFileSync(path.join(ARTIFACTS, 'step2b-uiops-results.json'), JSON.stringify(results, null, 2))
  const pass = results.every((r) => r.pass)
  console.log(`[ui-ops] RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[ui-ops] fatal:', err)
  process.exit(1)
})
