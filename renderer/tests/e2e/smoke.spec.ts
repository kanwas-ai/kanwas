import { expect, test } from '@playwright/test'

async function installDesktopBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'kanwas', {
      configurable: true,
      value: {
        platform: 'darwin',
        listVaults: async () => [],
        openVault: async () => null,
        activateVault: async () => {
          throw new Error('No vault')
        },
        renameVaultLabel: async () => {
          throw new Error('No vault')
        },
        forgetVault: async () => undefined,
        onPrepareToQuit: () => () => undefined,
        readyToQuit: () => undefined,
      },
    })
  })
}

test.beforeEach(async ({ page }) => {
  await installDesktopBridge(page)
  await page.route('**/api/workspaces', (route) => route.fulfill({ json: [] }))
})

test('renders the desktop empty state without hosted services', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Open a folder' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Folder…' })).toBeVisible()
  await expect(page.getByText(/sign in|register|team invite/i)).toHaveCount(0)
})

test('hosted routes collapse back to the local app', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Open a folder' })).toBeVisible()
})
