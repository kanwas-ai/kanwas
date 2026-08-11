import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getErrorLogContext } from './error-utils.js'
import { bindLoggerContext, logger as rootLogger, type Logger } from './logger.js'
import { convertLegacyStoredDocumentToV2 } from './migrations/legacy_workspace_to_note_subdocs.js'
import { getContextLogger, type OperationContext } from './operation-context.js'

export interface DocumentStore {
  loadRoot(workspaceId: string, context?: OperationContext): Promise<Uint8Array | null>
  saveRoot(workspaceId: string, documentBytes: Uint8Array, context?: OperationContext): Promise<void>
  loadNote(workspaceId: string, noteId: string, context?: OperationContext): Promise<Uint8Array | null>
  saveNote(workspaceId: string, noteId: string, documentBytes: Uint8Array, context?: OperationContext): Promise<void>
  deleteNote(workspaceId: string, noteId: string, context?: OperationContext): Promise<void>
}

export interface LegacyDocumentStore extends DocumentStore {
  loadLegacyDocument(workspaceId: string, context?: OperationContext): Promise<Uint8Array | null>
}

export interface R2DocumentStoreOptions {
  endpoint: string
  bucket: string
  accessKeyId: string
  logger?: Logger
  secretAccessKey: string
  region?: string
  forcePathStyle?: boolean
}

const V3_PREFIX = 'v3/workspaces'
const V2_PREFIX = 'v2'

export class R2DocumentStore implements LegacyDocumentStore {
  private readonly client: S3Client
  private readonly log: Logger

  constructor(private readonly options: R2DocumentStoreOptions) {
    this.client = new S3Client({
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? true,
      region: options.region ?? 'auto',
    })
    this.log = (options.logger ?? rootLogger).child({ component: 'R2DocumentStore' })
  }

  async loadRoot(workspaceId: string, context?: OperationContext): Promise<Uint8Array | null> {
    return this.loadByKey(getRootKey(workspaceId), workspaceId, context)
  }

  async saveRoot(workspaceId: string, documentBytes: Uint8Array, context?: OperationContext): Promise<void> {
    await this.saveByKey(getRootKey(workspaceId), workspaceId, documentBytes, context)
  }

  async loadLegacyDocument(workspaceId: string, context?: OperationContext): Promise<Uint8Array | null> {
    const v2Document = await this.loadByKey(getV2DocumentKey(workspaceId), workspaceId, context)
    if (v2Document) {
      return v2Document
    }

    const legacyDocument = await this.loadByKey(getLegacyDocumentKey(workspaceId), workspaceId, context)
    return legacyDocument ? convertLegacyStoredDocumentToV2(legacyDocument) : null
  }

  async loadNote(workspaceId: string, noteId: string, context?: OperationContext): Promise<Uint8Array | null> {
    return this.loadByKey(getNoteKey(workspaceId, noteId), workspaceId, context)
  }

  async saveNote(
    workspaceId: string,
    noteId: string,
    documentBytes: Uint8Array,
    context?: OperationContext
  ): Promise<void> {
    await this.saveByKey(getNoteKey(workspaceId, noteId), workspaceId, documentBytes, context)
  }

  async deleteNote(workspaceId: string, noteId: string, context?: OperationContext): Promise<void> {
    const key = getNoteKey(workspaceId, noteId)

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
        })
      )
    } catch (error) {
      getStorageLogger(this.log, workspaceId, context).error(
        {
          ...getErrorLogContext(error),
          bucket: this.options.bucket,
          endpoint: this.options.endpoint,
          key,
          noteId,
          storageDriver: 'r2',
        },
        'Failed to delete note document from storage backend'
      )
      throw error
    }
  }

  private async loadByKey(key: string, workspaceId: string, context?: OperationContext): Promise<Uint8Array | null> {
    const log = getStorageLogger(this.log, workspaceId, context)

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
        })
      )

      if (!response.Body) {
        log.warn({ key, storageDriver: 'r2' }, 'Storage backend returned an empty document body')
        return null
      }

      return await streamToUint8Array(response.Body)
    } catch (error) {
      if (error instanceof NoSuchKey || isMissingKeyError(error)) {
        return null
      }

      log.error(
        {
          ...getErrorLogContext(error),
          bucket: this.options.bucket,
          endpoint: this.options.endpoint,
          key,
          storageDriver: 'r2',
        },
        'Failed to load document from storage backend'
      )
      throw error
    }
  }

  private async saveByKey(
    key: string,
    workspaceId: string,
    documentBytes: Uint8Array,
    context?: OperationContext
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          Body: documentBytes,
          ContentType: 'application/octet-stream',
        })
      )
    } catch (error) {
      getStorageLogger(this.log, workspaceId, context).error(
        {
          ...getErrorLogContext(error),
          bucket: this.options.bucket,
          docSize: documentBytes.byteLength,
          endpoint: this.options.endpoint,
          key,
          storageDriver: 'r2',
        },
        'Failed to save document to storage backend'
      )
      throw error
    }
  }
}

export class FileDocumentStore implements LegacyDocumentStore {
  private readonly log: Logger

  constructor(
    private readonly directory: string,
    logger: Logger = rootLogger
  ) {
    this.log = logger.child({ component: 'FileDocumentStore' })
  }

  async loadRoot(workspaceId: string, context?: OperationContext): Promise<Uint8Array | null> {
    return this.loadFromPath(this.getRootFilePath(workspaceId), workspaceId, context)
  }

  async saveRoot(workspaceId: string, documentBytes: Uint8Array, context?: OperationContext): Promise<void> {
    await this.saveToPath(this.getRootFilePath(workspaceId), workspaceId, documentBytes, context)
  }

  async loadLegacyDocument(workspaceId: string, context?: OperationContext): Promise<Uint8Array | null> {
    const v2Document = await this.loadFromPath(
      path.join(this.directory, getV2DocumentKey(workspaceId)),
      workspaceId,
      context
    )
    if (v2Document) {
      return v2Document
    }

    const legacyDocument = await this.loadFromPath(
      path.join(this.directory, getLegacyDocumentKey(workspaceId)),
      workspaceId,
      context
    )
    return legacyDocument ? convertLegacyStoredDocumentToV2(legacyDocument) : null
  }

  async loadNote(workspaceId: string, noteId: string, context?: OperationContext): Promise<Uint8Array | null> {
    return this.loadFromPath(this.getNoteFilePath(workspaceId, noteId), workspaceId, context)
  }

  async saveNote(
    workspaceId: string,
    noteId: string,
    documentBytes: Uint8Array,
    context?: OperationContext
  ): Promise<void> {
    await this.saveToPath(this.getNoteFilePath(workspaceId, noteId), workspaceId, documentBytes, context)
  }

  async deleteNote(workspaceId: string, noteId: string, context?: OperationContext): Promise<void> {
    const filePath = this.getNoteFilePath(workspaceId, noteId)

    try {
      await unlink(filePath)
    } catch (error) {
      if (isMissingFileError(error)) {
        return
      }

      getStorageLogger(this.log, workspaceId, context).error(
        {
          ...getErrorLogContext(error),
          filePath,
          noteId,
          storageDriver: 'fs',
        },
        'Failed to delete note document from storage backend'
      )
      throw error
    }
  }

  private getRootFilePath(workspaceId: string): string {
    return path.join(this.directory, getRootKey(workspaceId))
  }

  private getNoteFilePath(workspaceId: string, noteId: string): string {
    return path.join(this.directory, getNoteKey(workspaceId, noteId))
  }

  private async loadFromPath(
    filePath: string,
    workspaceId: string,
    context?: OperationContext
  ): Promise<Uint8Array | null> {
    const log = getStorageLogger(this.log, workspaceId, context)

    try {
      return await readFile(filePath)
    } catch (error) {
      if (isMissingFileError(error)) {
        return null
      }

      log.error(
        {
          ...getErrorLogContext(error),
          filePath,
          storageDriver: 'fs',
        },
        'Failed to load document from storage backend'
      )
      throw error
    }
  }

  private async saveToPath(
    filePath: string,
    workspaceId: string,
    documentBytes: Uint8Array,
    context?: OperationContext
  ): Promise<void> {
    try {
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, documentBytes)
    } catch (error) {
      getStorageLogger(this.log, workspaceId, context).error(
        {
          ...getErrorLogContext(error),
          docSize: documentBytes.byteLength,
          filePath,
          storageDriver: 'fs',
        },
        'Failed to save document to storage backend'
      )
      throw error
    }
  }
}

function getStorageLogger(baseLogger: Logger, workspaceId: string, context?: OperationContext): Logger {
  return bindLoggerContext(getContextLogger(baseLogger, context), { workspaceId })
}

function isMissingKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('name' in error && error.name === 'NoSuchKey') || ('Code' in error && error.Code === 'NoSuchKey'))
  )
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function getRootKey(workspaceId: string): string {
  return `${V3_PREFIX}/${workspaceId}/root`
}

function getNoteKey(workspaceId: string, noteId: string): string {
  return `${V3_PREFIX}/${workspaceId}/notes/${noteId}`
}

function getLegacyDocumentKey(workspaceId: string): string {
  return workspaceId
}

function getV2DocumentKey(workspaceId: string): string {
  return `${V2_PREFIX}/${workspaceId}`
}

async function streamToUint8Array(stream: {
  transformToByteArray?: () => Promise<Uint8Array>
  [Symbol.asyncIterator]?: () => AsyncIterator<unknown>
}): Promise<Uint8Array> {
  if (typeof stream.transformToByteArray === 'function') {
    return stream.transformToByteArray()
  }

  if (!stream[Symbol.asyncIterator]) {
    throw new Error('Unsupported R2 response body type')
  }

  const chunks: Uint8Array[] = []

  for await (const chunk of stream as AsyncIterable<unknown>) {
    if (chunk instanceof Uint8Array) {
      chunks.push(chunk)
      continue
    }

    if (chunk instanceof ArrayBuffer) {
      chunks.push(new Uint8Array(chunk))
      continue
    }

    throw new Error('Unsupported R2 response chunk type')
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }

  return result
}
