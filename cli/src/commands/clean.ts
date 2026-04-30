import * as readline from 'readline/promises'
import chalk from 'chalk'
import { readGlobalConfig, readLocalConfig, writeLocalConfig } from '../config.js'
import { connect } from '../connection.js'
import { createIgnoreMatcher, flattenFSNode } from '../fs-utils.js'
import { workspaceToFilesystem, ContentConverter, FilesystemSyncer } from 'shared/server'
import { PathMapper } from 'shared'
import type { FileChange } from 'shared/server'

export async function cleanCommand(opts: { force?: boolean }): Promise<void> {
  const globalConfig = await readGlobalConfig()
  const localConfig = await readLocalConfig()

  if (!opts.force) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(
      chalk.yellow(
        `Delete all remote files in workspace "${localConfig.workspaceName}"? Local files are not affected. (y/N) `
      )
    )
    rl.close()
    if (answer.trim().toLowerCase() !== 'y') {
      process.exit(0)
    }
  }

  console.log(chalk.dim('Connecting to workspace...'))
  const connection = await connect({
    yjsServerHost: globalConfig.yjsServerHost,
    workspaceId: localConfig.workspaceId,
    globalConfig,
  })

  try {
    console.log(chalk.dim('Reading workspace state...'))
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    const matcher = createIgnoreMatcher(localConfig.ignore)
    const remoteFiles = flattenFSNode(fsTree, '', matcher)

    if (remoteFiles.size === 0) {
      console.log(chalk.green('Workspace is already empty.'))
      return
    }

    const pathMapper = new PathMapper()
    pathMapper.buildFromWorkspace(connection.proxy)

    const contentConverter = new ContentConverter()
    const noopUploader = async () => ({ storagePath: '', mimeType: '', size: 0 })
    const noopReader = async () => Buffer.from('')

    const syncer = new FilesystemSyncer({
      proxy: connection.proxy,
      yDoc: connection.yDoc,
      pathMapper,
      contentConverter,
      fileUploader: noopUploader,
      fileReader: noopReader,
    })

    // Delete all remote files
    const changes: FileChange[] = []
    for (const [relPath] of remoteFiles) {
      changes.push({ type: 'delete', path: relPath })
    }

    let deleted = 0
    for (const change of changes) {
      try {
        const result = await syncer.syncChange(change)
        if (result.success && result.action !== 'no_op') {
          console.log(`  ${chalk.red('-')} ${change.path}`)
          deleted++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`  ${chalk.red('!')} ${change.path}: ${msg}`)
      }
    }

    // Give the Yjs server a moment to auto-save
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Clear snapshot since remote is now empty
    await writeLocalConfig({ ...localConfig, snapshot: {} })

    console.log(chalk.green(`\nDeleted ${deleted} remote file(s). Local files untouched.`))
  } finally {
    connection.disconnect()
  }
}
