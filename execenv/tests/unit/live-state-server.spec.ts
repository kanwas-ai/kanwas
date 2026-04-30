import { describe, expect, it, vi, afterEach } from 'vitest'
import pino from 'pino'
import { LiveStateServer } from '../../src/live-state-server.js'

const logger = pino({ level: 'silent' })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LiveStateServer', () => {
  it('returns section existence from the live-state handler', async () => {
    const server = new LiveStateServer(
      {
        waitForSectionInCanvas: vi.fn().mockResolvedValue(true),
        resolveFileAnchorPlacement: vi
          .fn()
          .mockResolvedValue({ exists: true, destinationSectionTitle: 'Overview', createsSectionTitle: null }),
        getFileSectionMembership: vi.fn().mockResolvedValue({ sectionTitle: null, memberCount: null }),
        applySectionChanges: vi.fn().mockResolvedValue({ paths: [] }),
      },
      logger,
      43128
    )

    await server.start()

    try {
      const response = await fetch('http://127.0.0.1:43128/sections/wait', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ relativePath: 'docs/hello.md', title: 'Overview', timeoutMs: 250 }),
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true, exists: true })
    } finally {
      await server.stop()
    }
  })

  it('returns exists false when the section does not appear before timeout', async () => {
    const server = new LiveStateServer(
      {
        waitForSectionInCanvas: vi.fn().mockResolvedValue(false),
        resolveFileAnchorPlacement: vi
          .fn()
          .mockResolvedValue({ exists: true, destinationSectionTitle: 'Overview', createsSectionTitle: null }),
        getFileSectionMembership: vi.fn().mockResolvedValue({ sectionTitle: null, memberCount: null }),
        applySectionChanges: vi.fn().mockResolvedValue({ paths: [] }),
      },
      logger,
      43128
    )

    await server.start()

    try {
      const response = await fetch('http://127.0.0.1:43128/sections/wait', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ relativePath: 'docs/hello.md', title: 'Overview', timeoutMs: 250 }),
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true, exists: false })
    } finally {
      await server.stop()
    }
  })

  it('returns file-anchor placement from the live-state handler', async () => {
    const resolveFileAnchorPlacement = vi
      .fn()
      .mockResolvedValue({ exists: true, destinationSectionTitle: 'Existing', createsSectionTitle: null })
    const server = new LiveStateServer(
      {
        waitForSectionInCanvas: vi.fn().mockResolvedValue(true),
        resolveFileAnchorPlacement,
        getFileSectionMembership: vi.fn().mockResolvedValue({ sectionTitle: null, memberCount: null }),
        applySectionChanges: vi.fn().mockResolvedValue({ paths: [] }),
      },
      logger,
      43128
    )

    await server.start()

    try {
      const response = await fetch('http://127.0.0.1:43128/file-anchor/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetRelativePath: 'docs/new.md',
          anchorFilePath: 'docs/hello.md',
          fallbackSectionTitle: 'Related',
          timeoutMs: 250,
        }),
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        ok: true,
        exists: true,
        destinationSectionTitle: 'Existing',
        createsSectionTitle: null,
      })
      expect(resolveFileAnchorPlacement).toHaveBeenCalledWith({
        targetRelativePath: 'docs/new.md',
        anchorFilePath: 'docs/hello.md',
        fallbackSectionTitle: 'Related',
        timeoutMs: 250,
      })
    } finally {
      await server.stop()
    }
  })

  it('rejects invalid request bodies', async () => {
    const waitForSectionInCanvas = vi.fn().mockResolvedValue(true)
    const server = new LiveStateServer(
      {
        waitForSectionInCanvas,
        resolveFileAnchorPlacement: vi
          .fn()
          .mockResolvedValue({ exists: true, destinationSectionTitle: 'Overview', createsSectionTitle: null }),
        getFileSectionMembership: vi.fn().mockResolvedValue({ sectionTitle: null, memberCount: null }),
        applySectionChanges: vi.fn().mockResolvedValue({ paths: [] }),
      },
      logger,
      43128
    )

    await server.start()

    try {
      const response = await fetch('http://127.0.0.1:43128/sections/wait', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ relativePath: '', title: 'Overview', timeoutMs: 250 }),
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        exists: false,
        error: 'relativePath must be a non-empty string.',
      })
      expect(waitForSectionInCanvas).not.toHaveBeenCalled()
    } finally {
      await server.stop()
    }
  })

  it('returns 500 when the live-state handler throws', async () => {
    const server = new LiveStateServer(
      {
        waitForSectionInCanvas: vi.fn().mockRejectedValue(new Error('boom')),
        resolveFileAnchorPlacement: vi
          .fn()
          .mockResolvedValue({ exists: true, destinationSectionTitle: 'Overview', createsSectionTitle: null }),
        getFileSectionMembership: vi.fn().mockResolvedValue({ sectionTitle: null, memberCount: null }),
        applySectionChanges: vi.fn().mockResolvedValue({ paths: [] }),
      },
      logger,
      43128
    )

    await server.start()

    try {
      const response = await fetch('http://127.0.0.1:43128/sections/wait', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ relativePath: 'docs/hello.md', title: 'Overview', timeoutMs: 250 }),
      })

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({ ok: false, exists: false, error: 'Internal server error.' })
    } finally {
      await server.stop()
    }
  })

  it('returns file section membership from the live-state handler', async () => {
    const getFileSectionMembership = vi.fn().mockResolvedValue({ sectionTitle: 'Overview', memberCount: 2 })
    const server = new LiveStateServer(
      {
        waitForSectionInCanvas: vi.fn().mockResolvedValue(true),
        resolveFileAnchorPlacement: vi
          .fn()
          .mockResolvedValue({ exists: true, destinationSectionTitle: 'Overview', createsSectionTitle: null }),
        getFileSectionMembership,
        applySectionChanges: vi.fn().mockResolvedValue({ paths: [] }),
      },
      logger,
      43128
    )

    await server.start()

    try {
      const response = await fetch('http://127.0.0.1:43128/sections/membership', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ relativePath: 'docs/hello.md' }),
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true, sectionTitle: 'Overview', memberCount: 2 })
      expect(getFileSectionMembership).toHaveBeenCalledWith({ relativePath: 'docs/hello.md' })
    } finally {
      await server.stop()
    }
  })

  it('applies section changes through the live-state handler', async () => {
    const applySectionChanges = vi.fn().mockResolvedValue({ paths: ['docs/hello.md'] })
    const server = new LiveStateServer(
      {
        waitForSectionInCanvas: vi.fn().mockResolvedValue(true),
        resolveFileAnchorPlacement: vi
          .fn()
          .mockResolvedValue({ exists: true, destinationSectionTitle: 'Overview', createsSectionTitle: null }),
        getFileSectionMembership: vi.fn().mockResolvedValue({ sectionTitle: null, memberCount: null }),
        applySectionChanges,
      },
      logger,
      43128
    )

    await server.start()

    try {
      const response = await fetch('http://127.0.0.1:43128/sections/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          canvasPath: 'docs',
          changes: [{ type: 'move_files', sectionId: 'section-1', paths: ['docs/hello.md'] }],
        }),
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true, paths: ['docs/hello.md'] })
      expect(applySectionChanges).toHaveBeenCalledWith({
        canvasPath: 'docs',
        changes: [{ type: 'move_files', sectionId: 'section-1', paths: ['docs/hello.md'] }],
      })
    } finally {
      await server.stop()
    }
  })
})
