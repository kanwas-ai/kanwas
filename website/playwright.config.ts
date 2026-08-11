import { defineConfig } from '@playwright/test'

const baseURL = process.env.PARITY_BASE_URL ?? 'http://localhost:3000'

const viewports = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-1024', width: 1024, height: 900 },
  { name: 'tablet-768', width: 768, height: 900 },
  { name: 'mobile-375', width: 375, height: 812 },
]

export default defineConfig({
  testDir: './visual-baseline',
  snapshotPathTemplate: '{testDir}/kanwas.ai/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    colorScheme: 'light',
    deviceScaleFactor: 1,
    locale: 'en-US',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 0,
      maxDiffPixelRatio: 0,
    },
  },
  projects: viewports.map((viewport) => ({
    name: viewport.name,
    use: {
      viewport: { width: viewport.width, height: viewport.height },
    },
  })),
})
