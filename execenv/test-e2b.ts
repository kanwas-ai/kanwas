/**
 * Test script for E2B sandbox (staging/production only)
 *
 * This script tests E2B sandbox connectivity to a deployed Yjs server instance.
 * It cannot be used for local development due to tunnel/HTTP/2 WebSocket issues.
 *
 * Usage:
 *   WORKSPACE_ID=<uuid> YJS_SERVER_HOST=<deployed-host> npx tsx execenv/test-e2b.ts
 *
 * Example:
 *   WORKSPACE_ID=abc123 YJS_SERVER_HOST=yjs.kanwas.ai npx tsx execenv/test-e2b.ts
 */
import { Sandbox } from 'e2b'

async function main() {
  const workspaceId = process.env.WORKSPACE_ID
  const yjsServerHost = process.env.YJS_SERVER_HOST

  if (!workspaceId || !yjsServerHost) {
    console.error('Usage: WORKSPACE_ID=<uuid> YJS_SERVER_HOST=<host> npx tsx execenv/test-e2b.ts')
    process.exit(1)
  }

  console.log('Creating sandbox...')
  console.log(`  Workspace ID: ${workspaceId}`)
  console.log(`  Yjs server host: ${yjsServerHost}`)

  // Create sandbox with environment variables
  const sandbox = await Sandbox.create('kanwas-execenv', {
    envs: {
      WORKSPACE_ID: workspaceId,
      YJS_SERVER_HOST: yjsServerHost,
      YJS_SERVER_PROTOCOL: 'wss', // Use secure WebSocket for production
    },
  })

  console.log(`Sandbox created: ${sandbox.sandboxId}`)

  try {
    // Start the sync runner (entrypoint.sh starts it in background)
    console.log('\nStarting sync runner...')
    const result = await sandbox.commands.run('/app/execenv/entrypoint.sh', {
      timeout: 30000,
      onStdout: (data) => process.stdout.write(data),
      onStderr: (data) => process.stderr.write(data),
    })

    console.log('\nSync runner exit code:', result.exitCode)

    // List workspace files
    console.log('\nWorkspace contents:')
    const lsResult = await sandbox.commands.run('ls -la /workspace')
    console.log(lsResult.stdout)

    // Keep sandbox alive for manual testing
    console.log('\nSandbox is running. Press Ctrl+C to stop.')
    console.log(`Connect with: e2b sandbox connect ${sandbox.sandboxId}`)

    // Wait for interrupt
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        console.log('\nReceived SIGINT, closing sandbox...')
        resolve()
      })
    })
  } finally {
    console.log('Closing sandbox...')
    await sandbox.kill()
    console.log('Done.')
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
