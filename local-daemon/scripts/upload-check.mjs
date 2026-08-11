// Step 2C upload verification — drives the STOCK frontend and asserts that
// uploading an image, a generic file, and an audio clip each:
//   - writes the binary into the canvas directory on disk (dedup names),
//   - produces EXACTLY ONE node (no watcher-minted duplicate), and
//   - renders (img / file card / audio element).
// Restart-stability is checked separately by the driver (kill+restart+render).
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

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
)
const CSV = Buffer.from('a,b,c\n1,2,3\n', 'utf-8')
// Minimal MP3 frame header bytes — enough to be a distinct audio payload.
const MP3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(64, 0x00)])

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`[upload] ${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const listDisk = (ext) => fs.readdirSync(WS_DIR).filter((f) => f.toLowerCase().endsWith(ext))

async function pollFor(fn, timeoutMs = 12000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await sleep(intervalMs)
  }
  return false
}

async function findEmptyPaneSpot(page) {
  const boxes = await page.$$eval('.react-flow__node', (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })
  )
  const candidates = []
  for (let x = 140; x <= 1480; x += 70) for (let y = 140; y <= 900; y += 70) candidates.push({ x, y })
  const clear = (p) => boxes.every((b) => p.x < b.x - 40 || p.x > b.x + b.w + 40 || p.y < b.y - 40 || p.y > b.y + b.h + 40)
  return candidates.find(clear) ?? { x: 120, y: 880 }
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

  const nodeCount = () => page.$$eval('.react-flow__node', (els) => els.length)

  // Right-click an empty spot and pick a context-menu item that opens a file chooser.
  async function uploadViaMenu(label, file) {
    await page.keyboard.press('Escape')
    await sleep(200)
    const spot = await findEmptyPaneSpot(page)
    await page.mouse.click(spot.x, spot.y, { button: 'right' })
    const item = page.locator(`button:has-text("${label}")`).first()
    await item.waitFor({ timeout: 6000 })
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), item.click()])
    await chooser.setFiles({ name: file.name, mimeType: file.mimeType, buffer: file.buffer })
  }

  // --- 1. Image upload ---
  const imgBefore = listDisk('.png').length
  const nBeforeImg = await nodeCount()
  await uploadViaMenu('Add image', { name: 'uploaded-photo.png', mimeType: 'image/png', buffer: PNG_1x1 })
  const imgOnDisk = await pollFor(() => listDisk('.png').length === imgBefore + 1)
  await sleep(1500)
  const nAfterImg = await nodeCount()
  const imgRenders = (await page.$$eval('.react-flow__node img', (els) => els.length)) > 0
  const imgFile = listDisk('.png').find((f) => f.includes('uploaded-photo')) || listDisk('.png').slice(-1)[0]
  record('image upload → one node, file on disk, renders',
    imgOnDisk && nAfterImg === nBeforeImg + 1 && imgRenders,
    `disk=${imgFile}, nodes ${nBeforeImg}→${nAfterImg}, img=${imgRenders}`)

  // --- 2. Generic file upload ---
  const csvBefore = listDisk('.csv').length
  const nBeforeFile = await nodeCount()
  await uploadViaMenu('Add file', { name: 'dataset.csv', mimeType: 'text/csv', buffer: CSV })
  const csvOnDisk = await pollFor(() => listDisk('.csv').length === csvBefore + 1)
  await sleep(1500)
  const nAfterFile = await nodeCount()
  const csvFile = listDisk('.csv').slice(-1)[0]
  record('file upload → one node, file on disk',
    csvOnDisk && nAfterFile === nBeforeFile + 1,
    `disk=${csvFile}, nodes ${nBeforeFile}→${nAfterFile}`)

  // --- 3. Audio upload (via synthetic drop, routed to addAudioNode) ---
  const mp3Before = listDisk('.mp3').length
  const nBeforeAudio = await nodeCount()
  const spot = await findEmptyPaneSpot(page)
  await page.evaluate(
    async ([b64, x, y]) => {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const file = new File([bytes], 'clip.mp3', { type: 'audio/mpeg' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const target = document.elementFromPoint(x, y) || document.querySelector('.react-flow__pane') || document.body
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }
      target.dispatchEvent(new DragEvent('dragenter', opts))
      target.dispatchEvent(new DragEvent('dragover', opts))
      target.dispatchEvent(new DragEvent('drop', opts))
    },
    [MP3.toString('base64'), spot.x, spot.y]
  )
  const mp3OnDisk = await pollFor(() => listDisk('.mp3').length === mp3Before + 1)
  await sleep(1500)
  const nAfterAudio = await nodeCount()
  const audioRenders = (await page.$$eval('.react-flow__node audio', (els) => els.length)) > 0
  const mp3File = listDisk('.mp3').slice(-1)[0]
  record('audio upload → one node, file on disk, audio element',
    mp3OnDisk && nAfterAudio === nBeforeAudio + 1 && audioRenders,
    `disk=${mp3File}, nodes ${nBeforeAudio}→${nAfterAudio}, audio=${audioRenders}`)

  await page.screenshot({ path: path.join(ARTIFACTS, 'step2c-1-uploads.png') })

  // Record the uploaded filenames so the driver can assert restart-stability.
  fs.writeFileSync(
    path.join(ARTIFACTS, 'step2c-upload-files.json'),
    JSON.stringify({ image: imgFile, file: csvFile, audio: mp3File }, null, 2)
  )
  fs.writeFileSync(path.join(ARTIFACTS, 'step2c-upload-console.log'), consoleLines.join('\n'))
  fs.writeFileSync(path.join(ARTIFACTS, 'step2c-upload-results.json'), JSON.stringify(results, null, 2))
  const pass = results.every((r) => r.pass)
  console.log(`[upload] RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  await browser.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[upload] fatal:', err)
  process.exit(1)
})
