// Exit criterion (b) orchestrator: open the workspace in the browser, take a
// BEFORE screenshot, run the external-edit script (disk edit -> live syncChange
// as a non-frontend client), then assert the open note updates live in the DOM
// and take an AFTER screenshot.
//
// Run from spike/ so @playwright/test resolves (spike/node_modules/@playwright).
import { chromium } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileP = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const spikeRoot = path.resolve(here, '..')

const FRONTEND_PORT = process.env.SPIKE_FRONTEND_PORT || '5199'
const WORKSPACE_URL_ID = process.env.SPIKE_WS_URL_ID || '4a7c1e9b2d6f4b3a9c1e000000000001'
const ARTIFACTS = path.join(spikeRoot, 'artifacts')
const URL = `http://localhost:${FRONTEND_PORT}/app/w/${WORKSPACE_URL_ID}`
const TSX = '/Users/johancutych/Documents/kanwas/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs'
const REL = 'expedition-notes.md'
const MARKER = `EXTERNALEDIT${Date.now()}`

fs.mkdirSync(ARTIFACTS, { recursive: true })

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.addInitScript(() => window.localStorage.setItem('auth_token', 'spike-bearer-token'))
  const page = await context.newPage()

  console.log(`[edit-test] opening ${URL}`)
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.react-flow__node', { timeout: 35000 })
  // Ensure the expedition note node has rendered its content.
  await page.waitForFunction(() => document.body.innerText.includes('The field team reached the ridge'), {
    timeout: 20000,
  })
  await page.waitForTimeout(1500)

  const before = await page.evaluate(() => document.body.innerText)
  const markerBefore = before.includes(MARKER)
  await page.screenshot({ path: path.join(ARTIFACTS, 'b-before.png') })
  console.log(`[edit-test] BEFORE: marker present = ${markerBefore} (expected false)`)

  // Run the external-edit script: disk edit + live syncChange as non-frontend client.
  console.log(`[edit-test] running external-edit.ts (${REL}, ${MARKER}) ...`)
  const { stdout } = await execFileP('node', [TSX, path.join(here, 'external-edit.ts'), REL, MARKER], {
    cwd: spikeRoot,
    env: { ...process.env, SPIKE_SECRET: 'dev' },
  })
  console.log(stdout.split('\n').map((l) => '   ' + l).join('\n'))

  // Poll the DOM for the marker to appear (fragment update -> live re-render).
  let appeared = false
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    const text = await page.evaluate(() => document.body.innerText)
    if (text.includes(MARKER)) {
      appeared = true
      break
    }
    await page.waitForTimeout(500)
  }

  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(ARTIFACTS, 'b-after.png') })

  console.log(`[edit-test] AFTER: marker "${MARKER}" present in DOM = ${appeared}`)
  const pass = !markerBefore && appeared
  console.log(`[edit-test] RESULT: ${pass ? 'PASS' : 'FAIL'}`)

  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[edit-test] fatal:', err)
  process.exit(1)
})
