import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TEST_EMAIL = 'playwright-test@example.com'

export default async function globalTeardown() {
  // Skip cleanup for smoke-only test runs
  const args = process.argv.join(' ')
  if (args.includes('smoke.spec') && !args.includes('workspace.spec')) {
    return
  }

  console.log('\n🧹 Cleaning up test user...')

  try {
    // Delete test user via backend command
    execSync(`node ace test:delete-user "${TEST_EMAIL}"`, {
      cwd: resolve(__dirname, '../../../backend'),
      stdio: 'inherit',
    })

    console.log('✅ Test user deleted\n')
  } catch (error) {
    console.error('⚠️ Failed to delete test user (non-fatal):', error)
    // Don't throw - cleanup failure shouldn't fail the test run
  }
}
