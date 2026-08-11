import { test, expect, Page } from '@playwright/test'

// Helper to collect errors during page navigation
function setupErrorCollection(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  // Collect console errors (these often indicate runtime crashes)
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Ignore expected errors (like network failures when backend isn't running)
      const ignoredPatterns = [
        'Failed to fetch',
        'ERR_CONNECTION_REFUSED',
        'net::ERR_',
        'NetworkError',
        '401', // Auth errors expected when not logged in
        '403',
        'AxiosError', // Network errors from API client
      ]
      if (!ignoredPatterns.some((p) => text.includes(p))) {
        consoleErrors.push(text)
      }
    }
  })

  // Collect uncaught exceptions (React crashes, import errors, etc.)
  page.on('pageerror', (err) => {
    pageErrors.push(err.message)
  })

  return { consoleErrors, pageErrors }
}

/**
 * Smoke test that catches runtime crashes.
 *
 * This test verifies the app loads without critical errors.
 * It doesn't require backend services - it just checks that
 * React renders and there are no uncaught exceptions.
 */
test.describe('Smoke Tests', () => {
  test('app loads without console errors', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorCollection(page)

    // Navigate to the app
    await page.goto('/')

    // Wait for React to mount - look for the app root with content
    // This catches "white screen" issues where React fails to render
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10000 })

    // Give the app a moment to finish initial rendering
    await page.waitForTimeout(2000)

    // Check for errors
    if (pageErrors.length > 0) {
      console.log('Page errors:', pageErrors)
    }
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors)
    }

    expect(pageErrors, 'Expected no uncaught exceptions').toHaveLength(0)
    expect(consoleErrors, 'Expected no console errors').toHaveLength(0)
  })

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/')

    // Should show some UI (login form, workspace list, etc.)
    // The exact element depends on auth state, but something should render
    const hasContent = await page.locator('body').evaluate((el) => {
      return el.innerText.trim().length > 0
    })

    expect(hasContent, 'Expected page to have visible content').toBe(true)
  })

  test('all routes load without crashes', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorCollection(page)

    // Test routes that don't require auth first
    const publicRoutes = ['/', '/login', '/register']

    for (const route of publicRoutes) {
      await page.goto(route)
      await page.waitForTimeout(500)
    }

    // Check for errors
    if (pageErrors.length > 0) {
      console.log('Page errors:', pageErrors)
    }
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors)
    }

    expect(pageErrors, 'Expected no uncaught exceptions').toHaveLength(0)
    expect(consoleErrors, 'Expected no console errors').toHaveLength(0)
  })
})
