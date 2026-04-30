import http from 'node:http'
import type { Logger } from 'pino'
import type { SectionLayout } from 'shared'

export const LIVE_STATE_SERVER_PORT = 43127

type WaitForSectionRequest = {
  relativePath?: unknown
  title?: unknown
  timeoutMs?: unknown
}

type ResolveFileAnchorPlacementRequest = {
  targetRelativePath?: unknown
  anchorFilePath?: unknown
  fallbackSectionTitle?: unknown
  timeoutMs?: unknown
}

type SectionMembershipRequest = {
  relativePath?: unknown
}

type ApplySectionChangesRequest = {
  canvasPath?: unknown
  changes?: unknown
}

type WaitForSectionResponse = {
  ok: boolean
  exists: boolean
  error?: string
}

type OkResponse = {
  ok: boolean
  paths?: string[]
  error?: string
}

type SectionMembershipResponse = {
  ok: boolean
  sectionTitle: string | null
  memberCount: number | null
  error?: string
}

export type FileAnchorPlacementResolution = {
  exists: boolean
  destinationSectionTitle: string | null
  createsSectionTitle: string | null
  code?: 'section_title_conflict'
  error?: string
}

type FileAnchorPlacementResponse = FileAnchorPlacementResolution & {
  ok: boolean
}

export type ApplySectionLocation =
  | {
      mode: 'position'
      x: number
      y: number
    }
  | {
      mode: 'after' | 'below'
      anchorSectionId: string
      gap?: number
    }

export type ApplySectionChange =
  | {
      type: 'update_section'
      sectionId: string
      title?: string
      layout?: SectionLayout
      columns?: number
    }
  | {
      type: 'move_files'
      sectionId: string
      paths: string[]
    }
  | {
      type: 'create_section'
      title: string
      layout: SectionLayout
      columns?: number
      location: ApplySectionLocation
      paths: string[]
    }

export interface LiveStateQueryHandler {
  waitForSectionInCanvas(input: { relativePath: string; title: string; timeoutMs: number }): Promise<boolean>
  resolveFileAnchorPlacement(input: {
    targetRelativePath: string
    anchorFilePath: string
    fallbackSectionTitle: string
    timeoutMs: number
  }): Promise<FileAnchorPlacementResolution>
  getFileSectionMembership(input: {
    relativePath: string
  }): Promise<{ sectionTitle: string | null; memberCount: number | null }>
  applySectionChanges(input: { canvasPath: string; changes: ApplySectionChange[] }): Promise<{ paths: string[] }>
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''

    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      if (body.length === 0) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function writeJson(
  response: http.ServerResponse,
  statusCode: number,
  payload: WaitForSectionResponse | OkResponse | SectionMembershipResponse | FileAnchorPlacementResponse
): void {
  response.writeHead(statusCode, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

export class LiveStateServer {
  private server: http.Server | null = null

  constructor(
    private readonly handler: LiveStateQueryHandler,
    private readonly logger: Logger,
    private readonly port: number = LIVE_STATE_SERVER_PORT
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return
    }

    this.server = http.createServer(async (request, response) => {
      try {
        if (request.method !== 'POST') {
          writeJson(response, 404, { ok: false, exists: false, error: 'Not found' })
          return
        }

        if (request.url === '/sections/wait') {
          const body = await readJsonBody(request)
          if (!isObjectRecord(body)) {
            writeJson(response, 400, { ok: false, exists: false, error: 'Invalid request body.' })
            return
          }

          const { relativePath, title, timeoutMs } = body as WaitForSectionRequest
          if (typeof relativePath !== 'string' || relativePath.length === 0) {
            writeJson(response, 400, { ok: false, exists: false, error: 'relativePath must be a non-empty string.' })
            return
          }

          if (typeof title !== 'string' || title.trim().length === 0) {
            writeJson(response, 400, { ok: false, exists: false, error: 'title must be a non-empty string.' })
            return
          }

          const effectiveTimeoutMs =
            typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 0

          const exists = await this.handler.waitForSectionInCanvas({
            relativePath,
            title: title.trim(),
            timeoutMs: effectiveTimeoutMs,
          })
          writeJson(response, 200, { ok: true, exists })
          return
        }

        if (request.url === '/file-anchor/resolve') {
          const body = await readJsonBody(request)
          if (!isObjectRecord(body)) {
            writeJson(response, 400, {
              ok: false,
              exists: false,
              destinationSectionTitle: null,
              createsSectionTitle: null,
              error: 'Invalid request body.',
            })
            return
          }

          const { targetRelativePath, anchorFilePath, fallbackSectionTitle, timeoutMs } =
            body as ResolveFileAnchorPlacementRequest
          if (typeof targetRelativePath !== 'string' || targetRelativePath.length === 0) {
            writeJson(response, 400, {
              ok: false,
              exists: false,
              destinationSectionTitle: null,
              createsSectionTitle: null,
              error: 'targetRelativePath must be a non-empty string.',
            })
            return
          }

          if (typeof anchorFilePath !== 'string' || anchorFilePath.length === 0) {
            writeJson(response, 400, {
              ok: false,
              exists: false,
              destinationSectionTitle: null,
              createsSectionTitle: null,
              error: 'anchorFilePath must be a non-empty string.',
            })
            return
          }

          if (typeof fallbackSectionTitle !== 'string' || fallbackSectionTitle.trim().length === 0) {
            writeJson(response, 400, {
              ok: false,
              exists: false,
              destinationSectionTitle: null,
              createsSectionTitle: null,
              error: 'fallbackSectionTitle must be a non-empty string.',
            })
            return
          }

          const effectiveTimeoutMs =
            typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 0

          const placement = await this.handler.resolveFileAnchorPlacement({
            targetRelativePath,
            anchorFilePath,
            fallbackSectionTitle: fallbackSectionTitle.trim(),
            timeoutMs: effectiveTimeoutMs,
          })
          writeJson(response, 200, { ok: placement.error === undefined, ...placement })
          return
        }

        if (request.url === '/sections/membership') {
          const body = await readJsonBody(request)
          if (!isObjectRecord(body)) {
            writeJson(response, 400, {
              ok: false,
              sectionTitle: null,
              memberCount: null,
              error: 'Invalid request body.',
            })
            return
          }

          const { relativePath } = body as SectionMembershipRequest
          if (typeof relativePath !== 'string' || relativePath.length === 0) {
            writeJson(response, 400, {
              ok: false,
              sectionTitle: null,
              memberCount: null,
              error: 'relativePath must be a non-empty string.',
            })
            return
          }

          const membership = await this.handler.getFileSectionMembership({ relativePath })
          writeJson(response, 200, { ok: true, ...membership })
          return
        }

        if (request.url === '/sections/apply') {
          const body = await readJsonBody(request)
          if (!isObjectRecord(body)) {
            writeJson(response, 400, { ok: false, error: 'Invalid request body.' })
            return
          }

          const { canvasPath, changes } = body as ApplySectionChangesRequest
          if (typeof canvasPath !== 'string' || canvasPath.length === 0) {
            writeJson(response, 400, { ok: false, error: 'canvasPath must be a non-empty string.' })
            return
          }

          if (!Array.isArray(changes) || changes.length === 0) {
            writeJson(response, 400, { ok: false, error: 'changes must be a non-empty array.' })
            return
          }

          try {
            const result = await this.handler.applySectionChanges({
              canvasPath,
              changes: changes as ApplySectionChange[],
            })
            writeJson(response, 200, { ok: true, paths: result.paths })
          } catch (error) {
            writeJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
          return
        }

        writeJson(response, 404, { ok: false, exists: false, error: 'Not found' })
      } catch (error) {
        this.logger.error({ err: error }, 'Live state server request failed')
        writeJson(response, 500, { ok: false, exists: false, error: 'Internal server error.' })
      }
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.port, '127.0.0.1', () => {
        this.server!.off('error', reject)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return
    }

    const server = this.server
    this.server = null
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }
}
