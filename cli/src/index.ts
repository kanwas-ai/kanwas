import { Command } from 'commander'
import { loginCommand } from './commands/init.js'
import { pullCommand } from './commands/pull.js'
import { pushCommand } from './commands/push.js'
import { cleanCommand } from './commands/clean.js'
import { workspacesCommand } from './commands/workspaces.js'

const program = new Command()

program
  .name('kanwas')
  .description('Sync local directories with Kanwas workspaces')
  .version('0.1.4')
  .addHelpText(
    'after',
    `
Workflow:
  1. kanwas login             Authenticate via browser
  2. kanwas pull              Select and download a workspace
  3. (edit files locally)
  4. kanwas push              Upload changes back

Auth is stored globally (~/.kanwas/config.json).
Each project directory binds to one workspace via .kanwas.json.

Use --id or --name flags with pull for non-interactive use (CI/agents).
Use "kanwas workspaces --json" to list workspaces programmatically.`
  )

// --- Main commands ---

program
  .command('login')
  .description('Authenticate with Kanwas via browser')
  .option('--api-url <url>')
  .option('--frontend-url <url>')
  .option('--yjs-server-host <host>')
  .action(async (opts) => {
    try {
      await loginCommand({
        apiUrl: opts.apiUrl,
        frontendUrl: opts.frontendUrl,
        yjsServerHost: opts.yjsServerHost,
      })
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command('pull')
  .description('Download workspace files to current directory')
  .option('--id <id>', 'Workspace ID (UUID)')
  .option('--name <name>', 'Workspace name (exact match)')
  .action(async (opts) => {
    try {
      await pullCommand({ id: opts.id, name: opts.name })
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command('push')
  .description('Upload local changes to the workspace')
  .action(async () => {
    try {
      await pushCommand()
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

// --- Utility commands ---

program
  .command('workspaces')
  .description('List workspaces you have access to')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      await workspacesCommand({ json: opts.json })
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command('clean')
  .description('Delete all remote files in the workspace')
  .option('--force', 'Skip confirmation prompt')
  .action(async (opts) => {
    try {
      await cleanCommand({ force: opts.force })
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program.parse()
