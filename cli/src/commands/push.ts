import * as readline from 'readline/promises'
import chalk from 'chalk'
import { readGlobalConfig, readLocalConfig, writeLocalConfig } from '../config.js'
import { apiFetch } from '../api.js'
import { connect } from '../connection.js'
import { createIgnoreMatcher, flattenFSNode, hashContent, shouldIgnore, walkLocalDir } from '../fs-utils.js'
import { workspaceToFilesystem, ContentConverter, FilesystemSyncer } from 'shared/server'
import { PathMapper } from 'shared'
import type { FileChange, FileUploadResult } from 'shared/server'

/** Check if a buffer would be corrupted by a UTF-8 round-trip. */
function isBinaryContent(buf: Buffer): boolean {
  return !Buffer.from(buf.toString('utf-8'), 'utf-8').equals(buf)
}

export async function pushCommand(): Promise<void> {
  const globalConfig = await readGlobalConfig()
  const localConfig = await readLocalConfig()
  const sourceDir = process.cwd()
  const snapshot = localConfig.snapshot ?? {}

  console.log(chalk.dim('Connecting to workspace...'))
  const connection = await connect({
    yjsServerHost: globalConfig.yjsServerHost,
    workspaceId: localConfig.workspaceId,
    globalConfig,
  })

  try {
    // Get current remote workspace state
    console.log(chalk.dim('Reading workspace state...'))
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    const remoteFiles = flattenFSNode(fsTree)

    // Hash remote files
    const remoteHashes: Record<string, string> = {}
    for (const [relPath, content] of remoteFiles) {
      remoteHashes[relPath] = hashContent(content)
    }

    // Build path mapper from current state
    const pathMapper = new PathMapper()
    pathMapper.buildFromWorkspace(connection.proxy)

    // Create content converter and filesystem syncer
    const contentConverter = new ContentConverter()

    const fileUploader = async (
      fileBuffer: Buffer,
      canvasId: string,
      filename: string,
      mimeType: string
    ): Promise<FileUploadResult> => {
      const formData = new FormData()
      formData.append('file', new Blob([fileBuffer], { type: mimeType }), filename)
      formData.append('canvas_id', canvasId)
      formData.append('filename', filename)

      const response = await apiFetch(globalConfig, `/workspaces/${localConfig.workspaceId}/files`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error(`Failed to upload file: ${response.status}`)
      return (await response.json()) as FileUploadResult
    }

    const fileReader = async (absolutePath: string): Promise<Buffer> => {
      const { readFile } = await import('fs/promises')
      return readFile(absolutePath)
    }

    const syncer = new FilesystemSyncer({
      proxy: connection.proxy,
      yDoc: connection.yDoc,
      pathMapper,
      contentConverter,
      fileUploader,
      fileReader,
      autoCreateCanvases: true,
    })

    // Walk local directory
    console.log(chalk.dim('Scanning local files...'))
    const matcher = createIgnoreMatcher(localConfig.ignore)
    const localFiles = await walkLocalDir(sourceDir, '', matcher)

    // Three-way diff using snapshot as base
    const changes: FileChange[] = []
    const conflicts: { path: string; reason: string }[] = []

    // Check local files against snapshot + remote
    for (const [relPath, localContent] of localFiles) {
      const localHash = hashContent(localContent)
      const snapshotHash = snapshot[relPath]
      const remoteHash = remoteHashes[relPath]

      const isBinary = isBinaryContent(localContent)

      if (!snapshotHash) {
        // New file (not in snapshot) → create
        if (isBinary) {
          changes.push({ type: 'create', path: relPath, binaryContent: localContent })
        } else {
          changes.push({ type: 'create', path: relPath, content: localContent.toString('utf-8') })
        }
      } else if (localHash !== snapshotHash) {
        // Modified locally
        if (remoteHash && remoteHash !== snapshotHash) {
          // Also modified remotely → conflict
          conflicts.push({ path: relPath, reason: 'modified both locally and remotely' })
        } else if (isBinary) {
          changes.push({ type: 'update', path: relPath, binaryContent: localContent })
        } else {
          // Only modified locally → safe to update
          changes.push({ type: 'update', path: relPath, content: localContent.toString('utf-8') })
        }
      }
      // else: unchanged locally → skip
    }

    // Check for deletions (in snapshot but not local)
    for (const relPath of Object.keys(snapshot)) {
      if (shouldIgnore(relPath, matcher)) continue
      if (!localFiles.has(relPath)) {
        const remoteHash = remoteHashes[relPath]
        const snapshotHash = snapshot[relPath]

        if (remoteHash && remoteHash !== snapshotHash) {
          // Deleted locally but modified remotely → conflict
          conflicts.push({ path: relPath, reason: 'deleted locally but modified remotely' })
        } else if (remoteHash) {
          // Deleted locally, unchanged remotely → safe to delete
          changes.push({ type: 'delete', path: relPath })
        }
        // else: already gone from remote → skip
      }
    }

    // Handle conflicts
    let conflictChanges: FileChange[] = []
    if (conflicts.length > 0) {
      console.log(chalk.yellow(`\nConflicts detected:`))
      for (const c of conflicts) {
        console.log(`  ${chalk.yellow('!')} ${c.path} — ${c.reason}`)
      }

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const answer = await rl.question(chalk.yellow(`\nPush these anyway? Local version will overwrite remote. (y/N) `))
      rl.close()

      if (answer.trim().toLowerCase() === 'y') {
        for (const c of conflicts) {
          const localContent = localFiles.get(c.path)
          if (localContent) {
            const cIsBinary = isBinaryContent(localContent)
            conflictChanges.push({
              type: 'update',
              path: c.path,
              ...(cIsBinary ? { binaryContent: localContent } : { content: localContent.toString('utf-8') }),
            })
          } else {
            conflictChanges.push({ type: 'delete', path: c.path })
          }
        }
      } else {
        console.log(chalk.dim('Skipping conflicting files.'))
      }
    }

    const allChanges = [...changes, ...conflictChanges]

    if (allChanges.length === 0) {
      console.log(chalk.green('Already up to date.'))
      return
    }

    const created = allChanges.filter((c) => c.type === 'create').length
    const updated = allChanges.filter((c) => c.type === 'update').length
    const deleted = allChanges.filter((c) => c.type === 'delete').length

    console.log(chalk.dim(`\nChanges: ${created} new, ${updated} modified, ${deleted} deleted`))

    // Apply changes
    let errors = 0
    for (const change of allChanges) {
      try {
        const result = await syncer.syncChange(change)
        if ('success' in result && result.success) {
          const label =
            change.type === 'create' ? chalk.green('+') : change.type === 'update' ? chalk.yellow('~') : chalk.red('-')
          console.log(`  ${label} ${change.path}`)
        } else if ('error' in result) {
          console.log(`  ${chalk.red('!')} ${change.path}: ${(result as { error: string }).error}`)
          errors++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`  ${chalk.red('!')} ${change.path}: ${msg}`)
        errors++
      }
    }

    // Give the Yjs server a moment to auto-save
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Update snapshot to reflect new state
    const newSnapshot = { ...snapshot }
    for (const change of allChanges) {
      if (change.type === 'delete') {
        delete newSnapshot[change.path]
      } else if (change.content != null) {
        newSnapshot[change.path] = hashContent(change.content)
      } else if (change.binaryContent != null) {
        newSnapshot[change.path] = hashContent(change.binaryContent)
      }
    }
    // Also add any new remote files to snapshot so next push doesn't touch them
    for (const [relPath, hash] of Object.entries(remoteHashes)) {
      if (!(relPath in newSnapshot) && !shouldIgnore(relPath, matcher)) {
        newSnapshot[relPath] = hash
      }
    }
    await writeLocalConfig({ ...localConfig, snapshot: newSnapshot })

    if (errors > 0) {
      console.log(chalk.yellow(`\nPushed with ${errors} error(s).`))
    } else {
      console.log(chalk.green(`\nPushed ${allChanges.length} change(s) successfully.`))
    }
  } finally {
    connection.disconnect()
  }
}
