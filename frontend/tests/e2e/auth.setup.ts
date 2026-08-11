import { test as setup, expect } from '@playwright/test'

// Test credentials - set via environment variables
const TEST_EMAIL = process.env.TEST_EMAIL
const TEST_PASSWORD = process.env.TEST_PASSWORD

const authFile = 'tests/e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      'TEST_EMAIL and TEST_PASSWORD environment variables are required.\n' +
        'Run tests with: TEST_EMAIL=user@example.com TEST_PASSWORD=pass pnpm test:workspace'
    )
  }

  // Go to login page
  await page.goto('/login')
  await expect(page.locator('form')).toBeVisible({ timeout: 10000 })

  // Fill in credentials and submit
  await page.fill('input[name="email"]', TEST_EMAIL)
  await page.fill('input[name="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')

  // Wait for successful login - should redirect to workspace
  await page.waitForURL(/\/w\/[a-f0-9]+/, { timeout: 15000 })

  // Save authentication state
  await page.context().storageState({ path: authFile })
})
