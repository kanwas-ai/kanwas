import { test, expect, Page } from '@playwright/test'

// Helper to collect errors during page navigation
function setupErrorCollection(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  // Collect console errors (these often indicate runtime crashes)
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Ignore expected errors
      const ignoredPatterns = [
        'Failed to fetch',
        'ERR_CONNECTION_REFUSED',
        'net::ERR_',
        'NetworkError',
        'AxiosError',
        // Yjs server connection errors when server isn't running
        'WebSocket connection',
        'ws://',
        'wss://',
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
 * Authenticated workspace tests.
 *
 * These tests use auth state saved by auth.setup.ts.
 * Run with: TEST_EMAIL=user@example.com TEST_PASSWORD=pass pnpm test:workspace
 */
test.describe('Workspace Tests', () => {
  test('workspace loads without errors', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorCollection(page)

    // Navigate to root - should redirect to workspace (already authenticated)
    await page.goto('/')
    await page.waitForURL(/\/w\/[a-f0-9]+/, { timeout: 15000 })

    // Wait for workspace to fully load
    await page.waitForTimeout(3000)

    // Verify we're on a workspace page
    expect(page.url()).toMatch(/\/w\/[a-f0-9]+/)

    // Check for errors
    if (pageErrors.length > 0) {
      console.log('Page errors:', pageErrors)
    }
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors)
    }

    expect(pageErrors, 'Expected no uncaught exceptions on workspace page').toHaveLength(0)
    expect(consoleErrors, 'Expected no console errors on workspace page').toHaveLength(0)
  })

  test('workspace UI renders without crashes', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorCollection(page)

    await page.goto('/')
    await page.waitForURL(/\/w\/[a-f0-9]+/, { timeout: 15000 })

    // Wait for workspace to fully load
    await page.waitForTimeout(2000)

    // Try to interact with common UI elements to trigger lazy-loaded components
    const sidebar = page.locator('[data-testid="sidebar"], .sidebar, aside').first()
    if (await sidebar.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Sidebar is visible
    }

    // Wait for async components
    await page.waitForTimeout(2000)

    if (pageErrors.length > 0) {
      console.log('Page errors after UI render:', pageErrors)
    }
    if (consoleErrors.length > 0) {
      console.log('Console errors after UI render:', consoleErrors)
    }

    expect(pageErrors, 'Expected no uncaught exceptions').toHaveLength(0)
    expect(consoleErrors, 'Expected no console errors').toHaveLength(0)
  })

  test('skills section can expand without errors', async ({ page }) => {
    const { consoleErrors, pageErrors } = setupErrorCollection(page)

    await page.goto('/')
    await page.waitForURL(/\/w\/[a-f0-9]+/, { timeout: 15000 })
    await page.waitForTimeout(2000)

    // Find and click the Skills section expand button
    const skillsButton = page.locator('button:has-text("Skills")').first()
    if (await skillsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await skillsButton.click()

      const skillsHeading = page.getByRole('heading', { name: 'Skills' })
      await expect(skillsHeading).toBeVisible()

      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(skillsHeading).not.toBeVisible()
    }

    if (pageErrors.length > 0) {
      console.log('Page errors after Skills interaction:', pageErrors)
    }
    if (consoleErrors.length > 0) {
      console.log('Console errors after Skills interaction:', consoleErrors)
    }

    expect(pageErrors, 'Expected no uncaught exceptions').toHaveLength(0)
    expect(consoleErrors, 'Expected no console errors').toHaveLength(0)
  })
})
