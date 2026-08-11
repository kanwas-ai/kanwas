// Step 2C git-checkout storm — with the STOCK frontend open, checks out between
// two branches (alpha/beta) that share some IDENTICAL files, edit others, and
// add/remove others. After each checkout the canvas must converge and:
//   - identical-content files KEEP their node ids (and positions),
//   - edited files keep their id and update content,
//   - added files appear, removed files disappear,
//   - NO duplicate/orphan nodes, NO layout destruction,
//   - NO watcher feedback storm (writes are bounded and settle).
//
// Env: FE_PORT, WS_URL_ID, WS_DIR, ARTIFACTS.
import { chromium } from '@playwright/test'
import { execSync } from 'node:child_process'
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
  console.log(`[git-storm] ${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const git = (args) => execSync(`git ${args}`, { cwd: WS_DIR, stdio: 'pipe' }).toString().trim()

const metaDirs = ['', 'shared', 'notes']
function readMeta(rel) {
  const p = rel === '' ? path.join(WS_DIR, 'metadata.yaml') : path.join(WS_DIR, rel, 'metadata.yaml')
  try {
    return fs.readFileSync(p, 'utf-8')
  } catch {
    return ''
  }
}
/** Find a node's id + position across all canvas metadata files by node name. */
function node(name) {
  for (const dir of metaDirs) {
    const chunk = readMeta(dir)
      .split(/\n(?=  - id:)/)
      .find((c) => new RegExp(`name: ${name}\\b`).test(c))
    if (chunk) {
      return {
        id: chunk.match(/id: ([0-9a-f-]+)/)?.[1],
        x: chunk.match(/position:\s*\n\s*x: (-?[0-9.]+)/)?.[1],
        y: chunk.match(/\n\s*y: (-?[0-9.]+)/)?.[1],
      }
    }
  }
  return null
}
function allNodeIds() {
  const ids = []
  for (const dir of metaDirs)
    for (const c of readMeta(dir).split(/\n(?=  - id:)/)) {
      const m = c.match(/^ {2}- id: ([0-9a-f-]+)/m)
      if (m) ids.push(m[1])
    }
  return ids
}

async function pollFor(fn, timeoutMs = 10000, intervalMs = 250) {
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

  // Baseline (on alpha): capture stable-file ids + positions.
  const base = {
    common: node('common'),
    keep: node('keep'),
    deep: node('deep'),
    edited: node('edited'),
  }
  record('baseline: stable + edited nodes present on alpha',
    !!(base.common?.id && base.keep?.id && base.deep?.id && base.edited?.id),
    `common=${base.common?.id?.slice(0, 8)} edited=${base.edited?.id?.slice(0, 8)}`)

  const rootMeta = path.join(WS_DIR, 'metadata.yaml')

  // One checkout + convergence assertion. `expect` describes the target branch.
  async function checkoutAndAssert(branch, expect) {
    // Count metadata writes across the checkout to prove no feedback storm.
    let writes = 0
    let last = fs.statSync(rootMeta).mtimeMs
    let sampling = true
    const sampler = (async () => {
      while (sampling) {
        const m = fs.statSync(rootMeta).mtimeMs
        if (m !== last) {
          writes++
          last = m
        }
        await sleep(80)
      }
    })()

    git(`checkout -q ${branch}`)
    // Converge: edited content matches + presence of branch-only file's node.
    const converged = await pollFor(() => {
      const editedNode = node('edited')
      const present = node(expect.presentName)
      const absent = node(expect.absentName)
      return !!editedNode && present && !absent
    }, 12000)
    await sleep(3000) // let all debounced flushes settle
    sampling = false
    await sampler

    const editedNow = node('edited')
    const stableIds =
      node('common')?.id === base.common.id && node('keep')?.id === base.keep.id && node('deep')?.id === base.deep.id
    const stablePos =
      node('common')?.x === base.common.x && node('keep')?.x === base.keep.x && node('deep')?.x === base.deep.x
    const editedStable = editedNow?.id === base.edited.id
    const editedContent = fs.readFileSync(path.join(WS_DIR, 'edited.md'), 'utf-8').includes(expect.editedMarker)
    const presence = !!node(expect.presentName) && !node(expect.absentName)
    const ids = allNodeIds()
    const noDup = new Set(ids).size === ids.length
    const count = ids.length === expect.count
    const boundedWrites = writes <= 6

    record(`checkout ${branch} → converged, ids/pos stable, no dup, bounded writes`,
      converged && stableIds && stablePos && editedStable && editedContent && presence && noDup && count && boundedWrites,
      `stableIds=${stableIds} pos=${stablePos} editedId=${editedStable} content=${editedContent} presence=${presence} nodes=${ids.length}/${expect.count} dupFree=${noDup} writes=${writes}`)
  }

  // beta: edited→BETA, only-beta present, only-alpha absent. 5 nodes.
  await checkoutAndAssert('beta', {
    editedMarker: 'BETA',
    presentName: 'only-beta',
    absentName: 'only-alpha',
    count: 5,
  })
  // back to alpha
  await checkoutAndAssert('alpha', {
    editedMarker: 'Alpha',
    presentName: 'only-alpha',
    absentName: 'only-beta',
    count: 5,
  })
  // storm: rapid back-and-forth, then a final convergence check
  await checkoutAndAssert('beta', { editedMarker: 'BETA', presentName: 'only-beta', absentName: 'only-alpha', count: 5 })
  await checkoutAndAssert('alpha', {
    editedMarker: 'Alpha',
    presentName: 'only-alpha',
    absentName: 'only-beta',
    count: 5,
  })

  // Final: identical-content files kept their ORIGINAL ids through every checkout.
  const finalStable =
    node('common')?.id === base.common.id && node('keep')?.id === base.keep.id && node('deep')?.id === base.deep.id && node('edited')?.id === base.edited.id
  record('identical-content + edited files kept ids across the whole storm', finalStable,
    `common ${node('common')?.id === base.common.id}, edited ${node('edited')?.id === base.edited.id}`)

  await page.screenshot({ path: path.join(ARTIFACTS, 'step2c-4-git-storm.png') })
  fs.writeFileSync(path.join(ARTIFACTS, 'step2c-git-storm-results.json'), JSON.stringify(results, null, 2))
  const pass = results.every((r) => r.pass)
  console.log(`[git-storm] RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[git-storm] fatal:', err)
  process.exit(1)
})
