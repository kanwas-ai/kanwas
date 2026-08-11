import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as Y from 'yjs'
import { createNoopLogger } from '../helpers/test-utils.js'

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}))

vi.mock('@aws-sdk/client-s3', () => {
  class MockDeleteObjectCommand {
    constructor(readonly input: unknown) {}
  }

  class MockGetObjectCommand {
    constructor(readonly input: unknown) {}
  }

  class MockPutObjectCommand {
    constructor(readonly input: unknown) {}
  }

  class MockS3Client {
    send = sendMock

    constructor(readonly config: unknown) {}
  }

  class MockNoSuchKey extends Error {}

  return {
    DeleteObjectCommand: MockDeleteObjectCommand,
    GetObjectCommand: MockGetObjectCommand,
    NoSuchKey: MockNoSuchKey,
    PutObjectCommand: MockPutObjectCommand,
    S3Client: MockS3Client,
  }
})

import { NoSuchKey } from '@aws-sdk/client-s3'
import { FileDocumentStore, R2DocumentStore } from '../../src/storage.js'

afterEach(() => {
  sendMock.mockReset()
})

describe('FileDocumentStore', () => {
  it('roundtrips root bytes on disk', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'yjs-storage-'))
    const store = new FileDocumentStore(directory, createNoopLogger())
    const documentBytes = Uint8Array.from([1, 2, 3, 4])

    await store.saveRoot('workspace-1', documentBytes)

    const loadedBytes = await store.loadRoot('workspace-1')
    expect(Array.from(loadedBytes ?? [])).toEqual(Array.from(documentBytes))
  })

  it('roundtrips note bytes and supports note deletion', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'yjs-storage-'))
    const store = new FileDocumentStore(directory, createNoopLogger())
    const documentBytes = Uint8Array.from([5, 6, 7])

    await store.saveNote('workspace-1', 'note-1', documentBytes)
    await expect(store.loadNote('workspace-1', 'note-1')).resolves.toSatisfy(
      (value) => Array.from(value ?? []).join(',') === Array.from(documentBytes).join(',')
    )

    await store.deleteNote('workspace-1', 'note-1')
    await expect(store.loadNote('workspace-1', 'note-1')).resolves.toBeNull()
  })

  it('returns null when the root file does not exist', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'yjs-storage-'))
    const store = new FileDocumentStore(directory, createNoopLogger())

    await expect(store.loadRoot('missing-workspace')).resolves.toBeNull()
  })

  it('loads and converts legacy document bytes from disk', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'yjs-storage-'))
    const store = new FileDocumentStore(directory, createNoopLogger())
    const legacyDoc = new Y.Doc()

    try {
      legacyDoc.getMap('state').set('root', { marker: 'legacy-root' })
      const legacyPath = path.join(directory, 'workspace-legacy')
      await mkdir(path.dirname(legacyPath), { recursive: true })
      await writeFile(legacyPath, Y.encodeStateAsUpdate(legacyDoc))

      const loadedBytes = await store.loadLegacyDocument('workspace-legacy')
      expect(loadedBytes).not.toBeNull()

      const hydratedDoc = new Y.Doc()
      try {
        Y.applyUpdateV2(hydratedDoc, loadedBytes ?? new Uint8Array())
        expect(hydratedDoc.getMap('state').toJSON()).toEqual({ root: { marker: 'legacy-root' } })
      } finally {
        hydratedDoc.destroy()
      }
    } finally {
      legacyDoc.destroy()
    }
  })
})

describe('R2DocumentStore', () => {
  function createStore() {
    return new R2DocumentStore({
      accessKeyId: 'key',
      bucket: 'docs',
      endpoint: 'https://r2.test',
      logger: createNoopLogger(),
      secretAccessKey: 'secret',
    })
  }

  it('returns null for missing root and note objects', async () => {
    const store = createStore()

    sendMock.mockRejectedValueOnce(new NoSuchKey('missing'))
    await expect(store.loadRoot('workspace-1')).resolves.toBeNull()

    sendMock.mockRejectedValueOnce({ Code: 'NoSuchKey' })
    await expect(store.loadNote('workspace-1', 'note-1')).resolves.toBeNull()
  })

  it('loads note bytes from transformToByteArray responses', async () => {
    const store = createStore()
    sendMock.mockResolvedValueOnce({
      Body: {
        transformToByteArray: vi.fn(async () => Uint8Array.from([7, 8, 9])),
      },
    })

    await expect(store.loadNote('workspace-1', 'note-1')).resolves.toEqual(Uint8Array.from([7, 8, 9]))
    expect(sendMock.mock.calls[0][0].input).toEqual({ Bucket: 'docs', Key: 'v3/workspaces/workspace-1/notes/note-1' })
  })

  it('loads v2 legacy document bytes before checking the raw legacy key', async () => {
    const store = createStore()
    sendMock.mockResolvedValueOnce({
      Body: {
        transformToByteArray: vi.fn(async () => Uint8Array.from([1, 2, 3])),
      },
    })

    await expect(store.loadLegacyDocument('workspace-1')).resolves.toEqual(Uint8Array.from([1, 2, 3]))
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].input).toEqual({ Bucket: 'docs', Key: 'v2/workspace-1' })
  })

  it('converts raw legacy document bytes when the v2 object is missing', async () => {
    const store = createStore()
    const legacyDoc = new Y.Doc()

    try {
      legacyDoc.getMap('state').set('root', { marker: 'legacy-root' })

      sendMock.mockRejectedValueOnce(new NoSuchKey('missing'))
      sendMock.mockResolvedValueOnce({
        Body: {
          transformToByteArray: vi.fn(async () => Y.encodeStateAsUpdate(legacyDoc)),
        },
      })

      const loadedBytes = await store.loadLegacyDocument('workspace-1')
      expect(sendMock).toHaveBeenCalledTimes(2)
      expect(sendMock.mock.calls[1][0].input).toEqual({ Bucket: 'docs', Key: 'workspace-1' })

      const hydratedDoc = new Y.Doc()
      try {
        Y.applyUpdateV2(hydratedDoc, loadedBytes ?? new Uint8Array())
        expect(hydratedDoc.getMap('state').toJSON()).toEqual({ root: { marker: 'legacy-root' } })
      } finally {
        hydratedDoc.destroy()
      }
    } finally {
      legacyDoc.destroy()
    }
  })

  it('saves root bytes with the expected object metadata', async () => {
    const store = createStore()
    const documentBytes = Uint8Array.from([4, 5, 6])

    await store.saveRoot('workspace-1', documentBytes)

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].input).toEqual({
      Body: documentBytes,
      Bucket: 'docs',
      ContentType: 'application/octet-stream',
      Key: 'v3/workspaces/workspace-1/root',
    })
  })
})
