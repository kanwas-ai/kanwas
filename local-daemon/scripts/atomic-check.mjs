// Step 2C editor atomic-save identity — with the STOCK frontend open, attaches an
// edge to a note node, then simulates the ways editors persist a file:
//   A. delete + recreate, ~300ms gap  (chokidar → create-then-delete)
//   B. delete + recreate, ~900ms gap  (chokidar → delete-then-create)
//   C. write-tmp + rename over the file (chokidar → single update)
// After each, the node id, its position, and the attached edge must SURVIVE and
// the content must reflect the new bytes. Asserted via metadata.yaml (flusher).
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

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`[atomic] ${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const metaPath = path.join(WS_DIR, 'metadata.yaml')
const meta = () => fs.readFileSync(metaPath, 'utf-8')
const notePath = path.join(WS_DIR, 'expedition-notes.md')

/** Parse a root-metadata node chunk by node name. */
function nodeByName(name) {
  const chunk = meta()
    .split(/\n(?=  - id:)/)
    .find((c) => new RegExp(`name: ${name}\\b`).test(c))
  if (!chunk) return null
  return {
    id: chunk.match(/id: ([0-9a-f-]+)/)?.[1],
    x: chunk.match(/position:\s*\n\s*x: (-?[0-9.]+)/)?.[1],
    y: chunk.match(/y: (-?[0-9.]+)/)?.[1],
  }
}
function edgeExists(sourceId) {
  // edges are serialized before nodes; look inside the top-level edges: block.
  const m = meta().match(/edges:\n([\s\S]*?)\nnodes:/)
  return !!m && m[1].includes(`source: ${sourceId}`)
}

async function pollFor(fn, timeoutMs = 8000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await sleep(intervalMs)
  }
  return false
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ['auth_token', 'local-bearer'])
  const page = await context.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.react-flow__node .ProseMirror', { timeout: 35000 })
  await page.waitForTimeout(2500)

  const exp = nodeByName('expedition-notes')
  const readme = nodeByName('readme')
  const nodeId = exp?.id
  const pos0 = { x: exp?.x, y: exp?.y }

  // Attach an edge exp → readme by editing the root metadata externally.
  const withEdge = meta().replace(
    'edges: []',
    `edges:\n  - id: atomic-edge-1\n    source: ${nodeId}\n    target: ${readme?.id}`
  )
  fs.writeFileSync(metaPath, withEdge)
  const edgeApplied = await pollFor(() => edgeExists(nodeId))
  record('setup: edge attached to note node', edgeApplied && !!nodeId, `edge exp→readme applied=${edgeApplied}`)

  async function atomicCase(label, marker, mutate) {
    const before = nodeByName('expedition-notes')
    mutate(`# Expedition Notes\n\n${marker} content revised.\n`)
    // Wait past the watcher deferral (500) + orchestrator deferral (500) + flush (600).
    await sleep(2500)
    const after = nodeByName('expedition-notes')
    const idStable = !!after?.id && after.id === before.id
    const posStable = after?.x === pos0.x && after?.y === pos0.y
    const edgeKept = edgeExists(nodeId)
    const contentUpdated = fs.readFileSync(notePath, 'utf-8').includes(marker)
    const onlyOne = meta().split(/\n(?=  - id:)/).filter((c) => /name: expedition-notes\b/.test(c)).length === 1
    record(`${label} → id/edge/position survive, content updated`,
      idStable && posStable && edgeKept && contentUpdated && onlyOne,
      `id=${idStable} pos=${posStable} edge=${edgeKept} content=${contentUpdated} single=${onlyOne}`)
  }

  // A. delete + recreate, ~300ms gap
  await atomicCase('delete+recreate 300ms', 'ATOMIC-A', (content) => {
    fs.rmSync(notePath)
    const t = Date.now() + 300
    while (Date.now() < t) {} // busy-wait ~300ms without yielding the fs
    fs.writeFileSync(notePath, content)
  })

  // B. delete + recreate, ~900ms gap
  await atomicCase('delete+recreate 900ms', 'ATOMIC-B', (content) => {
    fs.rmSync(notePath)
    const t = Date.now() + 900
    while (Date.now() < t) {}
    fs.writeFileSync(notePath, content)
  })

  // C. write-tmp + rename over the file (VS Code / vim style)
  await atomicCase('write-tmp+rename', 'ATOMIC-C', (content) => {
    const tmp = `${notePath}.tmp`
    fs.writeFileSync(tmp, content)
    fs.renameSync(tmp, notePath)
  })

  await page.screenshot({ path: path.join(ARTIFACTS, 'step2c-3-atomic.png') })
  fs.writeFileSync(path.join(ARTIFACTS, 'step2c-atomic-results.json'), JSON.stringify(results, null, 2))
  const pass = results.every((r) => r.pass)
  console.log(`[atomic] RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[atomic] fatal:', err)
  process.exit(1)
})
