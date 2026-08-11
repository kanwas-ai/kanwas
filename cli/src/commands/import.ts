import fs from 'fs/promises'
import path from 'path'
import chalk from 'chalk'
import { readGlobalConfig } from '../config.js'
import { apiFetch } from '../api.js'
import { connect } from '../connection.js'
import { ContentConverter, FilesystemSyncer } from 'shared/server'
import { PathMapper } from 'shared'
import type { FileChange, FileUploadResult } from 'shared/server'
import { resolveWorkspace } from './workspaces.js'

export interface ImportOptions {
  id?: string
  name?: string
  dest?: string
  overwrite?: boolean
}

interface SourceFile {
  absolutePath: string
  workspacePath: string
}

async function collectMarkdownFiles(
  source: string,
  destPrefix: string
): Promise<{ files: SourceFile[]; skipped: number }> {
  const stat = await fs.stat(source)

  if (stat.isFile()) {
    if (!source.toLowerCase().endsWith('.md')) {
      return { files: [], skipped: 1 }
    }
    const workspacePath = joinWorkspacePath(destPrefix, path.basename(source))
    return { files: [{ absolutePath: path.resolve(source), workspacePath }], skipped: 0 }
  }

  if (!stat.isDirectory()) {
    throw new Error(`Source is neither a file nor a directory: ${source}`)
  }

  const files: SourceFile[] = []
  let skipped = 0

  async function walk(dir: string, relPrefix: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const abs = path.join(dir, entry.name)
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        await walk(abs, rel)
      } else if (entry.isFile()) {
        if (entry.name.toLowerCase().endsWith('.md')) {
          files.push({ absolutePath: path.resolve(abs), workspacePath: joinWorkspacePath(destPrefix, rel) })
        } else {
          skipped++
        }
      }
    }
  }

  await walk(path.resolve(source), '')
  return { files, skipped }
}

function joinWorkspacePath(prefix: string, rel: string): string {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '')
  const normalizedRel = rel.replace(/^\/+/, '')
  return normalizedPrefix ? `${normalizedPrefix}/${normalizedRel}` : normalizedRel
}

export async function importCommand(source: string, opts: ImportOptions = {}): Promise<void> {
  if (!source) {
    throw new Error('Source path is required.')
  }

  let sourceStat
  try {
    sourceStat = await fs.stat(source)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      throw new Error(`Source not found: ${source}`)
    }
    throw err
  }

  const globalConfig = await readGlobalConfig()
  const workspace = await resolveWorkspace(globalConfig, {
    id: opts.id,
    name: opts.name,
    promptTitle: 'Select target workspace:',
  })

  const destPrefix = (opts.dest ?? '').trim()

  console.log(chalk.dim(`Scanning ${sourceStat.isDirectory() ? 'directory' : 'file'} ${source}...`))
  const { files, skipped } = await collectMarkdownFiles(source, destPrefix)

  if (files.length === 0) {
    console.log(chalk.yellow('No markdown files found.'))
    return
  }
  if (skipped > 0) {
    console.log(chalk.dim(`Found ${files.length} markdown file(s); skipped ${skipped} non-markdown file(s).`))
  } else {
    console.log(chalk.dim(`Found ${files.length} markdown file(s).`))
  }

  console.log(chalk.dim(`Connecting to workspace ${workspace.name}...`))
  const connection = await connect({
    yjsServerHost: globalConfig.yjsServerHost,
    workspaceId: workspace.id,
    globalConfig,
  })

  try {
    const pathMapper = new PathMapper()
    pathMapper.buildFromWorkspace(connection.proxy)

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

      const response = await apiFetch(globalConfig, `/workspaces/${workspace.id}/files`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error(`Failed to upload file: ${response.status}`)
      return (await response.json()) as FileUploadResult
    }

    const fileReader = async (absolutePath: string): Promise<Buffer> => fs.readFile(absolutePath)

    const syncer = new FilesystemSyncer({
      proxy: connection.proxy,
      yDoc: connection.yDoc,
      pathMapper,
      contentConverter,
      fileUploader,
      fileReader,
      autoCreateCanvases: true,
    })

    const changes: FileChange[] = []
    let collisions = 0
    for (const file of files) {
      const existing = pathMapper.getMapping(file.workspacePath)
      const content = await fs.readFile(file.absolutePath, 'utf-8')

      if (existing) {
        if (!opts.overwrite) {
          console.log(chalk.yellow(`  ! ${file.workspacePath} already exists; pass --overwrite to replace.`))
          collisions++
          continue
        }
        changes.push({ type: 'update', path: file.workspacePath, content })
      } else {
        changes.push({ type: 'create', path: file.workspacePath, content })
      }
    }

    if (changes.length === 0) {
      console.log(chalk.yellow(`Nothing to import (${collisions} collision(s)).`))
      return
    }

    let errors = 0
    for (const change of changes) {
      try {
        const result = await syncer.syncChange(change)
        if ('success' in result && result.success) {
          const label = change.type === 'create' ? chalk.green('+') : chalk.yellow('~')
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

    const created = changes.filter((c) => c.type === 'create').length
    const updated = changes.filter((c) => c.type === 'update').length
    const summary = [
      created > 0 ? `${created} created` : null,
      updated > 0 ? `${updated} updated` : null,
      collisions > 0 ? `${collisions} skipped` : null,
      errors > 0 ? `${errors} error(s)` : null,
    ]
      .filter(Boolean)
      .join(', ')

    if (errors > 0) {
      console.log(chalk.yellow(`\nImport finished: ${summary}.`))
    } else {
      console.log(chalk.green(`\nImport finished: ${summary}.`))
    }
  } finally {
    connection.disconnect()
  }
}
