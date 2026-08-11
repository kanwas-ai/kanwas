import fs from 'fs/promises'
import path from 'path'
import * as yaml from 'yaml'
import type { FSNode } from 'shared/server'
import { sanitizeCanvasMetadata, type CanvasMetadata } from 'shared'

export type { CanvasMetadata }

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Write an FSNode tree to disk recursively.
 *
 * @param node - The FSNode to write
 * @param basePath - The base path to write to
 */
export async function writeFSNode(node: FSNode, basePath: string): Promise<void> {
  const nodePath = path.join(basePath, node.name)

  // Defense-in-depth: refuse to write outside the current parent (path traversal guard).
  const resolvedBase = path.resolve(basePath)
  const resolvedNode = path.resolve(nodePath)
  if (resolvedNode !== resolvedBase && !resolvedNode.startsWith(resolvedBase + path.sep)) {
    throw new Error(`Refusing to write outside base directory: ${node.name}`)
  }

  if (node.type === 'folder') {
    await fs.mkdir(nodePath, { recursive: true })

    if (node.children) {
      for (const child of node.children) {
        await writeFSNode(child, nodePath)
      }
    }
  } else {
    if (node.data) {
      await fs.writeFile(nodePath, node.data)
    } else {
      await fs.writeFile(nodePath, '')
    }
  }
}

/**
 * Clear directory contents without removing the directory itself.
 * This is important for E2B where /workspace is created by root but
 * the process runs as user - user can delete contents but not the parent.
 *
 * @param dirPath - The directory path to clear
 */
export async function clearDirectory(dirPath: string): Promise<void> {
  // Ensure directory exists
  await fs.mkdir(dirPath, { recursive: true })

  // Remove contents, not the directory itself (handles permission issues)
  const entries = await fs.readdir(dirPath)
  for (const entry of entries) {
    await fs.rm(path.join(dirPath, entry), { recursive: true, force: true })
  }
}

/**
 * Check if a path is a directory.
 *
 * @param filePath - The path to check
 * @returns true if the path is a directory
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export interface FileIdentitySnapshot {
  dev: number
  ino: number
  size: number
  mtimeMs: number
  isDirectory: boolean
}

/**
 * Read filesystem identity used to pair unlink/add rename events.
 */
export async function readFileIdentity(filePath: string): Promise<FileIdentitySnapshot | undefined> {
  try {
    const stats = await fs.lstat(filePath)
    return {
      dev: stats.dev,
      ino: stats.ino,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      isDirectory: stats.isDirectory(),
    }
  } catch {
    return undefined
  }
}

/**
 * Read file content as UTF-8 string.
 * Returns undefined if the file doesn't exist or can't be read.
 *
 * @param filePath - The path to the file
 * @returns The file content or undefined
 */
export async function readFileContent(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return undefined
  }
}

/**
 * Read file content as binary Buffer.
 * Used for binary files like images, PDFs, etc.
 *
 * @param filePath - The path to the file
 * @returns The file content as a Buffer
 * @throws Error if the file can't be read
 */
export async function readFileBinary(filePath: string): Promise<Buffer> {
  return await fs.readFile(filePath)
}

/**
 * Write a ready marker file to indicate hydration is complete.
 *
 * @param workspacePath - The workspace directory path
 */
export async function writeReadyMarker(workspacePath: string): Promise<void> {
  await fs.writeFile(path.join(workspacePath, '.ready'), '')
}

/**
 * Write metadata.yaml to a canvas directory.
 *
 * @param canvasDir - Path to the canvas directory
 * @param metadata - The canvas metadata to write
 */
export async function writeMetadataYaml(canvasDir: string, metadata: CanvasMetadata): Promise<void> {
  const sanitizedMetadata = isObjectRecord(metadata)
    ? sanitizeCanvasMetadata(metadata as unknown as Record<string, unknown>)
    : metadata
  const content = yaml.stringify(sanitizedMetadata)
  const metadataPath = path.join(canvasDir, 'metadata.yaml')

  try {
    const existing = await fs.readFile(metadataPath, 'utf-8')
    if (existing === content) {
      return
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code !== 'ENOENT') {
      throw error
    }
  }

  await fs.writeFile(metadataPath, content, 'utf-8')
}

/**
 * Read and parse metadata.yaml from a canvas directory.
 * Returns undefined only when metadata.yaml is missing.
 * Throws for invalid YAML/content.
 *
 * @param canvasDir - Path to the canvas directory
 * @returns The parsed metadata or undefined
 */
export async function readMetadataYaml(canvasDir: string): Promise<CanvasMetadata | undefined> {
  const metadataPath = path.join(canvasDir, 'metadata.yaml')

  let content: string
  try {
    content = await fs.readFile(metadataPath, 'utf-8')
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      return undefined
    }
    throw error
  }

  try {
    const parsed = yaml.parse(content)
    return isObjectRecord(parsed)
      ? (sanitizeCanvasMetadata(parsed) as unknown as CanvasMetadata)
      : (parsed as CanvasMetadata)
  } catch {
    throw new Error(`Invalid metadata.yaml at ${metadataPath}`)
  }
}

/**
 * Check if a canvas directory has a metadata.yaml file.
 *
 * @param canvasDir - Path to the canvas directory
 * @returns true if metadata.yaml exists
 */
export async function hasMetadataYaml(canvasDir: string): Promise<boolean> {
  try {
    const metadataPath = path.join(canvasDir, 'metadata.yaml')
    await fs.access(metadataPath)
    return true
  } catch {
    return false
  }
}

/**
 * List sibling canvas directories (directories with metadata.yaml) in the same parent.
 *
 * @param dirPath - Path to a directory
 * @returns Array of absolute paths to sibling canvas directories
 */
export async function listSiblingCanvasDirs(dirPath: string): Promise<string[]> {
  const parentDir = path.dirname(dirPath)
  const currentDirName = path.basename(dirPath)

  try {
    const entries = await fs.readdir(parentDir, { withFileTypes: true })
    const siblingDirs: string[] = []

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== currentDirName) {
        const siblingPath = path.join(parentDir, entry.name)
        if (await hasMetadataYaml(siblingPath)) {
          siblingDirs.push(siblingPath)
        }
      }
    }

    return siblingDirs
  } catch {
    return []
  }
}
