// Criterion 7 visual: enter the media sub-canvas and confirm the pre-existing
// binary images render through the daemon's signed-url static route.
// Run from frontend/. Env: WSID, ART, FE_PORT.
import { chromium } from '@playwright/test'

const WSID = process.env.WSID
const ART = process.env.ART || '.'
const FE_PORT = process.env.FE_PORT || '5273'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
await context.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ['auth_token', 'local-bearer'])
const page = await context.newPage()
await page.goto(`http://localhost:${FE_PORT}/app/w/${WSID}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.react-flow__node', { timeout: 30000 })
await page.waitForTimeout(2000)
const sel = process.env.MEDIA_ID ? `.react-flow__node[data-id="${process.env.MEDIA_ID}"]` : '.react-flow__node'
await page.locator(sel).first().dblclick()
await page.waitForTimeout(3000)
const imgs = await page.$$eval('img', (els) =>
  els.map((e) => ({ src: (e.currentSrc || e.src || '').slice(0, 70), w: e.naturalWidth, h: e.naturalHeight })).filter((i) => i.w > 0)
)
console.log('rendered images (naturalWidth>0):', JSON.stringify(imgs, null, 2))
await page.screenshot({ path: `${ART}/step2a-media-canvas.png` })
await browser.close()
const pass = imgs.some((i) => i.src.includes('/files/raw'))
console.log(`MEDIA RESULT: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
