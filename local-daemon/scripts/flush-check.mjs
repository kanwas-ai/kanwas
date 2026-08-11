// Step 2B flush verification — drives the STOCK frontend against a live daemon and
// asserts UI edits persist to the folder (the yDoc→folder flusher).
//
// Covers exit criteria that need the real room→FolderStore→flusher→disk path:
//   1. Type into an open note → the .md on disk updates (~2s), cosmetic-class diff.
//   2. Frontmatter file edited in UI → frontmatter byte-identical, body updated.
//   7. Echo-storm: rapid typing → bounded file writes, settles (no feedback loop).
//   8. Convergence: external disk edit + UI edit to different files → both land;
//      to the SAME file → no crash, no duplicate nodes.
// (Create/drag/rename/delete reconcile is proven by tests/folder-flusher.test.ts;
//  restart persistence — criterion 9 — is a separate bash step.)
//
// Run from any package that resolves @playwright/test. Env: FE_PORT, WS_URL_ID,
// WS_DIR, ARTIFACTS.
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
  console.log(`[flush] ${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`)
}

function splitFrontmatter(text) {
  if (!text.startsWith('---')) return { frontmatter: '', body: text }
  const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!m) return { frontmatter: '', body: text }
  return { frontmatter: m[0], body: text.slice(m[0].length) }
}
const read = (rel) => fs.readFileSync(path.join(WS_DIR, rel), 'utf-8')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pollFor(fn, timeoutMs = 8000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await sleep(intervalMs)
  }
  return false
}

async function typeInto(page, dataId, text) {
  const editor = page.locator(`.react-flow__node[data-id="${dataId}"] .ProseMirror`)
  // Force-click near the top-left text of the editor; the node's floating "extend"
  // button overlays the center and would otherwise intercept the pointer.
  await editor.click({ force: true, position: { x: 12, y: 12 } })
  await sleep(200)
  // Move the caret to the end of the document, then append.
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.type(text, { delay: 15 })
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

  const nodeInfo = await page.$$eval('.react-flow__node', (els) =>
    els
      .filter((e) => e.querySelector('.ProseMirror'))
      .map((e) => ({ id: e.getAttribute('data-id'), text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 40) }))
  )
  const baseNodeCount = (await page.$$('.react-flow__node')).length
  const expedition = nodeInfo.find((n) => /expedition/i.test(n.text))
  const framework = nodeInfo.find((n) => /frontmatter|framework/i.test(n.text))
  const readme = nodeInfo.find((n) => /field vault|readme/i.test(n.text))
  console.log('[flush] editable nodes:', JSON.stringify(nodeInfo))

  // --- Criterion 1: type into a note → .md updates on disk ---
  const marker1 = `UIEDIT-${Date.now()}`
  await typeInto(page, expedition.id, `\n\n${marker1}\n`)
  const c1 = await pollFor(() => read('expedition-notes.md').includes(marker1))
  record('1 type into note → .md updates on disk', c1, marker1)
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2b-1-type.png') })

  // --- Criterion 2: frontmatter byte-identical after a UI body edit ---
  const beforeFm = splitFrontmatter(read('framework-note.md')).frontmatter
  const marker2 = `FMEDIT-${Date.now()}`
  await typeInto(page, framework.id, `\n\n${marker2}\n`)
  const c2land = await pollFor(() => read('framework-note.md').includes(marker2))
  const afterFm = splitFrontmatter(read('framework-note.md')).frontmatter
  const fmIdentical = beforeFm.length > 0 && beforeFm === afterFm
  record('2 frontmatter byte-identical after UI edit', c2land && fmIdentical, `fm ${fmIdentical ? 'identical' : 'CHANGED'}`)
  fs.writeFileSync(path.join(ARTIFACTS, 'step2b-frontmatter-before.txt'), beforeFm)
  fs.writeFileSync(path.join(ARTIFACTS, 'step2b-frontmatter-after.txt'), afterFm)

  // --- Criterion 7: echo-storm → bounded writes, settles (no feedback loop) ---
  const stormFile = path.join(WS_DIR, 'expedition-notes.md')
  let writes = 0
  let lastMtime = fs.statSync(stormFile).mtimeMs
  let sampling = true
  const sampler = (async () => {
    while (sampling) {
      const m = fs.statSync(stormFile).mtimeMs
      if (m !== lastMtime) {
        writes++
        lastMtime = m
      }
      await sleep(150)
    }
  })()
  const editor = page.locator(`.react-flow__node[data-id="${expedition.id}"] .ProseMirror`)
  await editor.click({ force: true, position: { x: 12, y: 12 } })
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.press('End')
  // ~30s of activity as bursts: each burst is rapid typing (debounce should
  // coalesce it to a single write) followed by a gap that lets the flush fire.
  let keystrokes = 0
  const BURSTS = 8
  for (let b = 0; b < BURSTS; b++) {
    await page.keyboard.type('xxxxxxxx', { delay: 8 })
    keystrokes += 8
    await sleep(2600) // > room save debounce (1s) + flusher debounce (0.6s)
  }
  const writesDuringStorm = writes
  // Drain the final coalesced flush, then a QUIET window that must see 0 writes
  // (proves there is no watcher-feedback loop re-triggering flushes).
  await sleep(3000)
  const beforeQuiet = writes
  await sleep(4000)
  sampling = false
  await sampler
  const quietWrites = writes - beforeQuiet
  const totalWrites = writes
  const bounded = totalWrites >= 1 && totalWrites < keystrokes // far fewer writes than keystrokes
  const noLoop = quietWrites === 0
  // Folder still consistent (metadata parses, storm file readable, content landed).
  let consistent = true
  try {
    if (!read('expedition-notes.md').includes('xxxxxxxx')) consistent = false
    if (!read('metadata.yaml').includes('nodes:')) consistent = false
  } catch {
    consistent = false
  }
  record(
    '7 echo-storm bounded + no feedback loop + consistent',
    bounded && noLoop && consistent,
    `${keystrokes} keystrokes → ${totalWrites} writes (${writesDuringStorm} during); quiet-window writes=${quietWrites}`
  )
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2b-7-storm.png') })

  // --- Criterion 8: convergence — different files, then same file ---
  const extMarker = `EXT-${Date.now()}`
  const uiMarker = `UI-${Date.now()}`
  // external edit to README (disk) + UI edit to expedition (different files)
  fs.writeFileSync(path.join(WS_DIR, 'README.md'), read('README.md').trimEnd() + `\n\n${extMarker}\n`, 'utf-8')
  await typeInto(page, expedition.id, `\n\n${uiMarker}\n`)
  const bothLand = await pollFor(
    () => page.evaluate(() => document.body.innerText).then((t) => t.includes(extMarker)) &&
      Promise.resolve(read('expedition-notes.md').includes(uiMarker))
  )
  // same-file race: external + UI edit to expedition; assert no crash, no dup nodes
  const sameExt = `SAME-EXT-${Date.now()}`
  fs.writeFileSync(stormFile, read('expedition-notes.md').trimEnd() + `\n\n${sameExt}\n`, 'utf-8')
  await typeInto(page, expedition.id, ` SAME-UI `)
  await sleep(4000)
  const nodeCountAfter = (await page.$$('.react-flow__node')).length
  const noDup = nodeCountAfter === baseNodeCount
  const alive = (await page.$$('.react-flow__node .ProseMirror')).length >= 3
  record('8 convergence: both land, no dup nodes, no crash', bothLand && noDup && alive,
    `nodes ${baseNodeCount}→${nodeCountAfter}, bothLand=${bothLand}`)
  await page.screenshot({ path: path.join(ARTIFACTS, 'step2b-8-convergence.png') })

  fs.writeFileSync(path.join(ARTIFACTS, 'step2b-flush-console.log'), consoleLines.join('\n'))
  fs.writeFileSync(path.join(ARTIFACTS, 'step2b-flush-results.json'), JSON.stringify(results, null, 2))
  const pass = results.every((r) => r.pass)
  console.log(`[flush] RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[flush] fatal:', err)
  process.exit(1)
})
