# External Git Sync Implementation

## Overview

Implement external git sync allowing users to connect their own git repositories (GitHub, GitLab, Bitbucket, self-hosted) to Kanwas workspaces. Kanwas will force-push workspace content to these external repos as a mirror, providing users with a backup they control. Users can configure multiple external repos per workspace, each synced via HTTPS using Personal Access Tokens.

## Backpressure Gates

Validation (ALL must pass before commit):

- Typecheck: `pnpm typecheck` (from root - runs all packages)
- Lint: `pnpm lint` (from root)
- Unit tests: `cd backend && pnpm test`
- Build: `cd backend && pnpm build`

Note: Frontend smoke tests (`pnpm test:smoke`) only needed for UI phases (Phase 7+).

## Prerequisites

Before Phase 1, ensure infrastructure services are running:

```bash
docker-compose up -d postgres redis
```

Verify: `docker ps | grep -E "postgres|redis"`

## File Dependencies

```
Backend:
  external_git_sync model
    └─► external_git_sync_service.ts (CRUD, push logic)
          └─► Used by external_syncs_controller.ts
          └─► Called from a workspace-update event listener

Frontend:
  WorkspacePage
    └─► WorkspaceSidebar (needs: onOpenGitSync callback)
          └─► SettingsBar (adds Git Sync button, opens modal)
                └─► ExternalGitSyncModal (new component)
                      └─► ExternalSyncCard (list item)
                      └─► ExternalSyncForm (add/edit form)
                      └─► Uses: useExternalSyncs hook
```

## Import Patterns

```typescript
// Backend model imports
import ExternalGitSync from '#models/external_git_sync'
import type Workspace from '#models/workspace'

// Backend service pattern (use @inject decorator)
import { inject } from '@adonisjs/core'
import { ContextualLoggerContract } from '#contracts/contextual_logger'

// Frontend API imports
import { api } from '@/lib/api' // Tuyau client

// Frontend hooks pattern
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
```

## Reference Patterns

**Backend controller:** Follow `backend/app/controllers/connections_controller.ts` - CRUD pattern with validation

**Frontend modal:** Follow `frontend/src/components/ui/ConnectionsModal/ConnectionsModal.tsx` - modal structure, connection state

**Frontend hook:** Study `frontend/src/hooks/useConnections.ts` - React Query pattern for API calls

## Phase 0: Orientation (Every Iteration)

Before ANY implementation work:

1. Check `git status` and `git log --oneline -5` to see what's been done
2. Check if migration exists: `ls backend/database/migrations/ | grep external_git_sync`
3. Check if model exists: `ls backend/app/models/ | grep external_git_sync`
4. Check if service exists: `ls backend/app/services/ | grep external_git_sync`
5. Check if controller exists: `ls backend/app/controllers/ | grep external_sync`
6. Check if frontend hook exists: `ls frontend/src/hooks/ | grep -i externalsync`
7. Check if frontend modal exists: `ls frontend/src/components/ui/ | grep -i externalgit`

**CRITICAL: Search before assuming.** Do NOT assume something is missing. Use grep/find to verify what exists.

Identify which phase to work on next based on what's already implemented.

## Phase 1: Database Migration

Create migration for `external_git_syncs` table.

**File:** `backend/database/migrations/{timestamp}_create_external_git_syncs_table.ts`

Use timestamp format like existing migrations (e.g., `1768000000000`).

```typescript
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'external_git_syncs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('workspace_id').notNullable().references('id').inTable('workspaces').onDelete('CASCADE')

      // Connection details
      table.string('name', 100).notNullable() // User-friendly label
      table.text('remote_url').notNullable() // https://github.com/user/repo.git
      table.text('personal_access_token').notNullable() // Encrypted/plaintext PAT

      // Sync state
      table.boolean('sync_enabled').defaultTo(true)
      table.timestamp('last_sync_at', { useTz: true }).nullable()
      table.string('last_commit_hash', 40).nullable()
      table.enum('sync_status', ['idle', 'syncing', 'success', 'error']).defaultTo('idle')
      table.text('error_message').nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Index for quick lookup by workspace
      table.index(['workspace_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

**Verify:** `cd backend && node ace migration:run && node ace migration:status`

On success: `git commit -m "feat(git-sync): add external_git_syncs table migration"`

## Phase 2: Backend Model

Create Lucid model for external git syncs.

**File:** `backend/app/models/external_git_sync.ts`

```typescript
import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export default class ExternalGitSync extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare workspaceId: string

  @column()
  declare name: string

  @column()
  declare remoteUrl: string

  @column({ serializeAs: null }) // Never expose token in API responses
  declare personalAccessToken: string

  @column()
  declare syncEnabled: boolean

  @column.dateTime()
  declare lastSyncAt: DateTime | null

  @column()
  declare lastCommitHash: string | null

  @column()
  declare syncStatus: SyncStatus

  @column()
  declare errorMessage: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  /**
   * Get masked token for display (last 4 chars only)
   */
  getMaskedToken(): string {
    if (!this.personalAccessToken || this.personalAccessToken.length < 8) {
      return '••••••••'
    }
    return '••••••••' + this.personalAccessToken.slice(-4)
  }

  /**
   * Build git clone URL with embedded token for HTTPS auth
   * Format: https://{token}@github.com/user/repo.git
   */
  getAuthenticatedUrl(): string {
    const url = new URL(this.remoteUrl)
    url.username = this.personalAccessToken
    url.password = '' // Token goes in username for most git hosts
    return url.toString()
  }
}
```

**Verify:** `cd backend && pnpm build`

On success: `git commit -m "feat(git-sync): add ExternalGitSync model"`

## Phase 3: Backend Validators

Create validators for external sync operations.

**File:** `backend/app/validators/external_git_sync.ts`

```typescript
import vine from '@vinejs/vine'

/**
 * Validates external git sync creation
 */
export const createExternalGitSyncValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(100),
    remoteUrl: vine
      .string()
      .trim()
      .url()
      .regex(/^https:\/\/.+\.git$/i), // Must be HTTPS and end with .git
    personalAccessToken: vine.string().trim().minLength(1),
  })
)

/**
 * Validates external git sync updates
 */
export const updateExternalGitSyncValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(100).optional(),
    remoteUrl: vine
      .string()
      .trim()
      .url()
      .regex(/^https:\/\/.+\.git$/i)
      .optional(),
    personalAccessToken: vine.string().trim().minLength(1).optional(),
    syncEnabled: vine.boolean().optional(),
  })
)
```

**Verify:** `cd backend && pnpm build`

On success: `git commit -m "feat(git-sync): add external sync validators"`

## Phase 4: Backend Service

Create service for external git sync operations.

**File:** `backend/app/services/external_git_sync_service.ts`

```typescript
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import { inject } from '@adonisjs/core'
import ExternalGitSync from '#models/external_git_sync'
import type Workspace from '#models/workspace'
import type { ContextualLoggerContract } from '#contracts/contextual_logger'
import { workspaceToFilesystem, type FSNode } from 'shared'
import WorkspaceDocumentService from '#services/workspace_document_service'

const execAsync = promisify(exec)

@inject()
export default class ExternalGitSyncService {
  constructor(
    protected workspaceDocumentService: WorkspaceDocumentService,
    protected logger: ContextualLoggerContract
  ) {}

  /**
   * List all external syncs for a workspace
   */
  async list(workspaceId: string): Promise<ExternalGitSync[]> {
    return ExternalGitSync.query().where('workspace_id', workspaceId).orderBy('created_at', 'asc')
  }

  /**
   * Get a single external sync by ID (validates workspace ownership)
   */
  async get(workspaceId: string, syncId: string): Promise<ExternalGitSync | null> {
    return ExternalGitSync.query().where('id', syncId).where('workspace_id', workspaceId).first()
  }

  /**
   * Create a new external sync configuration
   */
  async create(
    workspaceId: string,
    data: { name: string; remoteUrl: string; personalAccessToken: string }
  ): Promise<ExternalGitSync> {
    return ExternalGitSync.create({
      workspaceId,
      name: data.name,
      remoteUrl: data.remoteUrl,
      personalAccessToken: data.personalAccessToken,
      syncEnabled: true,
      syncStatus: 'idle',
    })
  }

  /**
   * Update an external sync configuration
   */
  async update(
    workspaceId: string,
    syncId: string,
    data: Partial<{ name: string; remoteUrl: string; personalAccessToken: string; syncEnabled: boolean }>
  ): Promise<ExternalGitSync | null> {
    const sync = await this.get(workspaceId, syncId)
    if (!sync) return null

    sync.merge(data)
    await sync.save()
    return sync
  }

  /**
   * Delete an external sync configuration
   */
  async delete(workspaceId: string, syncId: string): Promise<boolean> {
    const sync = await this.get(workspaceId, syncId)
    if (!sync) return false

    await sync.delete()
    return true
  }

  /**
   * Test connection to external repo (verifies token works)
   */
  async testConnection(remoteUrl: string, token: string): Promise<{ success: boolean; error?: string }> {
    const tempDir = `/tmp/git-test-${nanoid()}`

    try {
      await mkdir(tempDir, { recursive: true })

      // Build authenticated URL
      const url = new URL(remoteUrl)
      url.username = token
      url.password = ''

      // Try to ls-remote (lightweight check, doesn't clone)
      await execAsync(`git ls-remote "${url.toString()}" HEAD`, {
        timeout: 15000,
        cwd: tempDir,
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      // Clean up error message (remove token if present)
      const cleanMessage = message.replace(token, '***')
      return { success: false, error: cleanMessage }
    } finally {
      try {
        await rm(tempDir, { recursive: true, force: true })
      } catch {}
    }
  }

  /**
   * Push workspace content to a single external sync
   */
  async pushToExternal(sync: ExternalGitSync, workspace: Workspace, lastCommitHash: string | null): Promise<void> {
    const startTime = Date.now()
    const workspaceId = workspace.id

    // Mark as syncing
    sync.syncStatus = 'syncing'
    sync.errorMessage = null
    await sync.save()

    const tempDir = `/tmp/external-sync-${nanoid()}`

    try {
      this.logger.info(
        { operation: 'external_sync_started', workspaceId, syncId: sync.id, syncName: sync.name },
        `Starting external sync to ${sync.name}`
      )

      await mkdir(tempDir, { recursive: true })

      // Initialize git repo
      await execAsync(`git init "${tempDir}"`)
      await execAsync(`git -C "${tempDir}" config user.name "Kanwas"`)
      await execAsync(`git -C "${tempDir}" config user.email "sync@kanwas.ai"`)

      // Get workspace filesystem representation
      const { fsNode, documents } = await this.getWorkspaceFilesystem(workspace)

      // Write files to temp dir (excluding workspace.yjs - external gets human-readable only)
      await this.writeFSNodeToFilesystem(fsNode, tempDir)

      // Write workspace.json
      const workspaceJson = {
        name: workspace.name,
        documents,
        syncedAt: new Date().toISOString(),
        sourceCommit: lastCommitHash,
      }
      await writeFile(join(tempDir, 'workspace.json'), JSON.stringify(workspaceJson, null, 2), 'utf-8')

      // Stage all files
      await execAsync(`git -C "${tempDir}" add -A`)

      // Check if there are changes
      const { stdout: status } = await execAsync(`git -C "${tempDir}" status --porcelain`)

      if (!status.trim()) {
        // No changes to push
        sync.syncStatus = 'success'
        sync.lastSyncAt = new DateTime()
        await sync.save()

        this.logger.info({ operation: 'external_sync_no_changes', workspaceId, syncId: sync.id }, 'No changes to sync')
        return
      }

      // Create commit
      const timestamp = new Date().toISOString()
      const commitMessage = `Sync from Kanwas: ${workspace.name}\n\nSynced at ${timestamp}\nDocuments: ${documents.length}`
      await execAsync(`git -C "${tempDir}" commit -m "${commitMessage}"`)

      // Add remote and force-push
      const authenticatedUrl = sync.getAuthenticatedUrl()
      await execAsync(`git -C "${tempDir}" remote add origin "${authenticatedUrl}"`)

      // Force push to main (with retry)
      await this.pushWithRetry(tempDir, sync.id, workspaceId)

      // Get commit hash
      const { stdout: commitHash } = await execAsync(`git -C "${tempDir}" rev-parse HEAD`)

      // Update sync status
      sync.syncStatus = 'success'
      sync.lastSyncAt = new DateTime()
      sync.lastCommitHash = commitHash.trim()
      sync.errorMessage = null
      await sync.save()

      const duration = Date.now() - startTime
      this.logger.info(
        { operation: 'external_sync_completed', workspaceId, syncId: sync.id, duration, commitHash: commitHash.trim() },
        `External sync to ${sync.name} completed in ${duration}ms`
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      // Clean error message (remove any tokens)
      const cleanError = errorMessage.replace(sync.personalAccessToken, '***')

      sync.syncStatus = 'error'
      sync.errorMessage = cleanError
      await sync.save()

      const duration = Date.now() - startTime
      this.logger.error(
        { operation: 'external_sync_failed', workspaceId, syncId: sync.id, duration, error: cleanError },
        `External sync to ${sync.name} failed: ${cleanError}`
      )
    } finally {
      // Cleanup temp directory
      try {
        await rm(tempDir, { recursive: true, force: true })
      } catch {}
    }
  }

  /**
   * Sync to all enabled external syncs for a workspace
   */
  async syncAll(workspace: Workspace, lastCommitHash: string | null): Promise<void> {
    const syncs = await ExternalGitSync.query().where('workspace_id', workspace.id).where('sync_enabled', true)

    if (syncs.length === 0) {
      return
    }

    this.logger.info(
      { operation: 'external_sync_all_started', workspaceId: workspace.id, syncCount: syncs.length },
      `Starting sync to ${syncs.length} external repo(s)`
    )

    // Sync sequentially to avoid overwhelming the system
    for (const sync of syncs) {
      try {
        await this.pushToExternal(sync, workspace, lastCommitHash)
      } catch (error) {
        // Error already logged in pushToExternal, continue to next sync
        this.logger.warn(
          { operation: 'external_sync_individual_failed', workspaceId: workspace.id, syncId: sync.id },
          `External sync ${sync.name} failed, continuing to next`
        )
      }
    }
  }

  /**
   * Push with retry logic (exponential backoff)
   */
  private async pushWithRetry(repoPath: string, syncId: string, workspaceId: string, maxRetries = 3): Promise<void> {
    let attempt = 0

    while (attempt < maxRetries) {
      try {
        await execAsync(`git -C "${repoPath}" push -f origin HEAD:main`, {
          timeout: 60000, // 60 second timeout
        })
        return
      } catch (error) {
        attempt++
        if (attempt >= maxRetries) {
          throw error
        }

        const delay = Math.pow(2, attempt) * 1000
        this.logger.warn(
          { operation: 'external_push_retry', syncId, workspaceId, attempt, maxRetries, delayMs: delay },
          `Push failed, retrying in ${delay}ms`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  /**
   * Get workspace filesystem representation via shared `workspaceToFilesystem()`
   */
  private async getWorkspaceFilesystem(workspace: Workspace): Promise<{
    fsNode: FSNode
    documents: Array<{ id: string; name: string; canvasId: string; canvasName: string; contentPreview: string }>
  }> {
    const { proxy, yDoc, dispose } = await this.workspaceDocumentService.getDocument(workspace)

    try {
      const fsNode = await workspaceToFilesystem(proxy, yDoc, { logger: this.logger })
      const documents = this.extractDocumentsFromFSNode(fsNode)
      return { fsNode, documents }
    } finally {
      dispose()
    }
  }

  /**
   * Extract document metadata from filesystem tree
   */
  private extractDocumentsFromFSNode(
    node: FSNode,
    canvasName = 'root',
    canvasId = 'root'
  ): Array<{ id: string; name: string; canvasId: string; canvasName: string; contentPreview: string }> {
    const documents: Array<{ id: string; name: string; canvasId: string; canvasName: string; contentPreview: string }> =
      []

    if (node.type === 'folder') {
      for (const child of node.children || []) {
        if (child.type === 'file' && child.name.endsWith('.md') && child.name !== 'metadata.yaml') {
          const content = child.data?.toString('utf-8') || ''
          documents.push({
            id: child.name.replace('.md', ''),
            name: child.name.replace('.md', ''),
            canvasId,
            canvasName,
            contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          })
        } else if (child.type === 'folder') {
          documents.push(...this.extractDocumentsFromFSNode(child, child.name, child.name))
        }
      }
    }

    return documents
  }

  /**
   * Write filesystem tree to disk
   */
  private async writeFSNodeToFilesystem(node: FSNode, basePath: string): Promise<void> {
    if (node.type === 'file') {
      const filePath = join(basePath, node.name)
      await writeFile(filePath, node.data || Buffer.from(''))
    } else if (node.type === 'folder') {
      const folderPath = node.name === '.' ? basePath : join(basePath, `c-${node.name}`)
      if (node.name !== '.') {
        await mkdir(folderPath, { recursive: true })
      }
      for (const child of node.children || []) {
        await this.writeFSNodeToFilesystem(child, folderPath)
      }
    }
  }
}
```

**Important:** Import `DateTime` from luxon, not from JS Date.

**Verify:** `cd backend && pnpm build`

On success: `git commit -m "feat(git-sync): add ExternalGitSyncService with push logic"`

## Phase 5: Backend Controller & Routes

Create controller and register routes.

**File:** `backend/app/controllers/external_syncs_controller.ts`

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import ExternalGitSyncService from '#services/external_git_sync_service'
import { createExternalGitSyncValidator, updateExternalGitSyncValidator } from '#validators/external_git_sync'
import Workspace from '#models/workspace'

@inject()
export default class ExternalSyncsController {
  constructor(private externalGitSyncService: ExternalGitSyncService) {}

  /**
   * GET /workspaces/:id/external-syncs
   */
  async index({ params, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspace = await Workspace.query()
      .where('id', params.id)
      .whereHas('owners', (q) => q.where('users.id', user.id))
      .firstOrFail()

    const syncs = await this.externalGitSyncService.list(workspace.id)

    return {
      syncs: syncs.map((sync) => ({
        id: sync.id,
        name: sync.name,
        remoteUrl: sync.remoteUrl,
        maskedToken: sync.getMaskedToken(),
        syncEnabled: sync.syncEnabled,
        lastSyncAt: sync.lastSyncAt?.toISO(),
        lastCommitHash: sync.lastCommitHash,
        syncStatus: sync.syncStatus,
        errorMessage: sync.errorMessage,
        createdAt: sync.createdAt.toISO(),
      })),
    }
  }

  /**
   * POST /workspaces/:id/external-syncs
   */
  async store({ params, auth, request }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspace = await Workspace.query()
      .where('id', params.id)
      .whereHas('owners', (q) => q.where('users.id', user.id))
      .firstOrFail()

    const data = await request.validateUsing(createExternalGitSyncValidator)
    const sync = await this.externalGitSyncService.create(workspace.id, data)

    return {
      sync: {
        id: sync.id,
        name: sync.name,
        remoteUrl: sync.remoteUrl,
        maskedToken: sync.getMaskedToken(),
        syncEnabled: sync.syncEnabled,
        syncStatus: sync.syncStatus,
        createdAt: sync.createdAt.toISO(),
      },
    }
  }

  /**
   * PATCH /workspaces/:id/external-syncs/:syncId
   */
  async update({ params, auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspace = await Workspace.query()
      .where('id', params.id)
      .whereHas('owners', (q) => q.where('users.id', user.id))
      .firstOrFail()

    const data = await request.validateUsing(updateExternalGitSyncValidator)
    const sync = await this.externalGitSyncService.update(workspace.id, params.syncId, data)

    if (!sync) {
      return response.notFound({ error: 'External sync not found' })
    }

    return {
      sync: {
        id: sync.id,
        name: sync.name,
        remoteUrl: sync.remoteUrl,
        maskedToken: sync.getMaskedToken(),
        syncEnabled: sync.syncEnabled,
        lastSyncAt: sync.lastSyncAt?.toISO(),
        lastCommitHash: sync.lastCommitHash,
        syncStatus: sync.syncStatus,
        errorMessage: sync.errorMessage,
      },
    }
  }

  /**
   * DELETE /workspaces/:id/external-syncs/:syncId
   */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspace = await Workspace.query()
      .where('id', params.id)
      .whereHas('owners', (q) => q.where('users.id', user.id))
      .firstOrFail()

    const deleted = await this.externalGitSyncService.delete(workspace.id, params.syncId)

    if (!deleted) {
      return response.notFound({ error: 'External sync not found' })
    }

    return { success: true }
  }

  /**
   * POST /workspaces/:id/external-syncs/test
   * Test connection without saving
   */
  async test({ request, response }: HttpContext) {
    const { remoteUrl, personalAccessToken } = request.only(['remoteUrl', 'personalAccessToken'])

    if (!remoteUrl || !personalAccessToken) {
      return response.badRequest({ error: 'remoteUrl and personalAccessToken are required' })
    }

    const result = await this.externalGitSyncService.testConnection(remoteUrl, personalAccessToken)

    return result
  }

  /**
   * POST /workspaces/:id/external-syncs/:syncId/push
   * Trigger manual push
   */
  async push({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspace = await Workspace.query()
      .where('id', params.id)
      .whereHas('owners', (q) => q.where('users.id', user.id))
      .firstOrFail()

    const sync = await this.externalGitSyncService.get(workspace.id, params.syncId)

    if (!sync) {
      return response.notFound({ error: 'External sync not found' })
    }

    // Push in background (don't wait)
    this.externalGitSyncService.pushToExternal(sync, workspace, null).catch(() => {
      // Error logged in service
    })

    return { message: 'Push initiated' }
  }
}
```

**Add routes to:** `backend/start/routes.ts`

Find the workspace routes group and add:

```typescript
// Inside the workspace routes group (after other workspace routes)
router.get('workspaces/:id/external-syncs', [ExternalSyncsController, 'index'])
router.post('workspaces/:id/external-syncs', [ExternalSyncsController, 'store'])
router.patch('workspaces/:id/external-syncs/:syncId', [ExternalSyncsController, 'update'])
router.delete('workspaces/:id/external-syncs/:syncId', [ExternalSyncsController, 'destroy'])
router.post('workspaces/:id/external-syncs/test', [ExternalSyncsController, 'test'])
router.post('workspaces/:id/external-syncs/:syncId/push', [ExternalSyncsController, 'push'])
```

Don't forget the import at top of routes.ts:

```typescript
import ExternalSyncsController from '#controllers/external_syncs_controller'
```

**Verify:** `cd backend && pnpm build`

On success: `git commit -m "feat(git-sync): add external syncs controller and routes"`

## Phase 6: Hook into Workspace Update Flow

Create a new event listener that subscribes to `WorkspaceDocumentUpdated` (or equivalent) and triggers external sync. The previous in-tree git versioning flow that this design referenced has been removed; re-wire the trigger to the appropriate workspace-update event.

```typescript
// Sync to external repos (fire-and-forget, don't block the event)
const ExternalGitSyncService = (await import('#services/external_git_sync_service')).default
const externalSyncService = await app.container.make(ExternalGitSyncService)

externalSyncService.syncAll(workspace).catch((error) => {
  logger.error({ operation: 'external_sync_trigger_failed', workspaceId, error }, 'Failed to trigger external syncs')
})
```

Import `app` at the top:

```typescript
import app from '@adonisjs/core/services/app'
```

**Verify:** `cd backend && pnpm build && pnpm test`

On success: `git commit -m "feat(git-sync): trigger external sync on workspace update"`

## Phase 7: Regenerate Tuyau Types

After adding new routes, regenerate frontend types.

**Run:** `cd backend && pnpm codegen`

**Verify:** Check that `frontend/src/api/.tuyau/` has been updated with new external sync endpoints.

On success: `git commit -m "chore: regenerate Tuyau types for external sync endpoints"`

## Phase 8: Frontend API Client

Create API functions for external syncs.

**File:** `frontend/src/api/externalSyncs.ts`

```typescript
import { api } from '@/lib/api'

export interface ExternalSync {
  id: string
  name: string
  remoteUrl: string
  maskedToken: string
  syncEnabled: boolean
  lastSyncAt: string | null
  lastCommitHash: string | null
  syncStatus: 'idle' | 'syncing' | 'success' | 'error'
  errorMessage: string | null
  createdAt: string
}

export interface CreateExternalSyncInput {
  name: string
  remoteUrl: string
  personalAccessToken: string
}

export interface UpdateExternalSyncInput {
  name?: string
  remoteUrl?: string
  personalAccessToken?: string
  syncEnabled?: boolean
}

export async function listExternalSyncs(workspaceId: string): Promise<ExternalSync[]> {
  const response = await api.workspaces({ id: workspaceId })['external-syncs'].$get()
  if (response.status !== 200) {
    throw new Error('Failed to fetch external syncs')
  }
  const data = await response.json()
  return data.syncs
}

export async function createExternalSync(workspaceId: string, input: CreateExternalSyncInput): Promise<ExternalSync> {
  const response = await api.workspaces({ id: workspaceId })['external-syncs'].$post({
    json: input,
  })
  if (response.status !== 200) {
    throw new Error('Failed to create external sync')
  }
  const data = await response.json()
  return data.sync
}

export async function updateExternalSync(
  workspaceId: string,
  syncId: string,
  input: UpdateExternalSyncInput
): Promise<ExternalSync> {
  const response = await api.workspaces({ id: workspaceId })['external-syncs']({ syncId }).$patch({
    json: input,
  })
  if (response.status !== 200) {
    throw new Error('Failed to update external sync')
  }
  const data = await response.json()
  return data.sync
}

export async function deleteExternalSync(workspaceId: string, syncId: string): Promise<void> {
  const response = await api.workspaces({ id: workspaceId })['external-syncs']({ syncId }).$delete()
  if (response.status !== 200) {
    throw new Error('Failed to delete external sync')
  }
}

export async function testExternalSyncConnection(
  workspaceId: string,
  remoteUrl: string,
  personalAccessToken: string
): Promise<{ success: boolean; error?: string }> {
  const response = await api.workspaces({ id: workspaceId })['external-syncs'].test.$post({
    json: { remoteUrl, personalAccessToken },
  })
  if (response.status !== 200) {
    throw new Error('Failed to test connection')
  }
  return response.json()
}

export async function triggerExternalSyncPush(workspaceId: string, syncId: string): Promise<void> {
  const response = await api.workspaces({ id: workspaceId })['external-syncs']({ syncId }).push.$post()
  if (response.status !== 200) {
    throw new Error('Failed to trigger push')
  }
}
```

**Verify:** `cd frontend && pnpm build`

On success: `git commit -m "feat(git-sync): add frontend API client for external syncs"`

## Phase 9: Frontend Hook

Create React Query hook for external syncs.

**File:** `frontend/src/hooks/useExternalSyncs.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listExternalSyncs,
  createExternalSync,
  updateExternalSync,
  deleteExternalSync,
  testExternalSyncConnection,
  triggerExternalSyncPush,
  type ExternalSync,
  type CreateExternalSyncInput,
  type UpdateExternalSyncInput,
} from '@/api/externalSyncs'

export function useExternalSyncs(workspaceId: string) {
  return useQuery({
    queryKey: ['external-syncs', workspaceId],
    queryFn: () => listExternalSyncs(workspaceId),
    staleTime: 30_000, // 30 seconds
  })
}

export function useCreateExternalSync(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateExternalSyncInput) => createExternalSync(workspaceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-syncs', workspaceId] })
    },
  })
}

export function useUpdateExternalSync(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ syncId, input }: { syncId: string; input: UpdateExternalSyncInput }) =>
      updateExternalSync(workspaceId, syncId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-syncs', workspaceId] })
    },
  })
}

export function useDeleteExternalSync(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (syncId: string) => deleteExternalSync(workspaceId, syncId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-syncs', workspaceId] })
    },
  })
}

export function useTestExternalSyncConnection(workspaceId: string) {
  return useMutation({
    mutationFn: ({ remoteUrl, personalAccessToken }: { remoteUrl: string; personalAccessToken: string }) =>
      testExternalSyncConnection(workspaceId, remoteUrl, personalAccessToken),
  })
}

export function useTriggerExternalSyncPush(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (syncId: string) => triggerExternalSyncPush(workspaceId, syncId),
    onSuccess: () => {
      // Refetch after a short delay to show updated status
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['external-syncs', workspaceId] })
      }, 1000)
    },
  })
}

export function useRefreshExternalSyncs(workspaceId: string) {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: ['external-syncs', workspaceId] })
  }
}
```

**Verify:** `cd frontend && pnpm build`

On success: `git commit -m "feat(git-sync): add useExternalSyncs React Query hooks"`

## Phase 10: Frontend Modal Component

Create the external git sync modal.

**File:** `frontend/src/components/ui/ExternalGitSyncModal/ExternalGitSyncModal.tsx`

```typescript
import { useState } from 'react'
import {
  useExternalSyncs,
  useCreateExternalSync,
  useDeleteExternalSync,
  useTestExternalSyncConnection,
  useTriggerExternalSyncPush,
  useUpdateExternalSync,
} from '@/hooks/useExternalSyncs'
import { ExternalSyncCard } from './ExternalSyncCard'
import { ExternalSyncForm } from './ExternalSyncForm'
import type { ExternalSync } from '@/api/externalSyncs'

interface ExternalGitSyncModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
}

export function ExternalGitSyncModal({ isOpen, onClose, workspaceId }: ExternalGitSyncModalProps) {
  const { data: syncs, isLoading } = useExternalSyncs(workspaceId)
  const createSync = useCreateExternalSync(workspaceId)
  const deleteSync = useDeleteExternalSync(workspaceId)
  const updateSync = useUpdateExternalSync(workspaceId)
  const testConnection = useTestExternalSyncConnection(workspaceId)
  const triggerPush = useTriggerExternalSyncPush(workspaceId)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingSync, setEditingSync] = useState<ExternalSync | null>(null)

  const handleCreate = async (data: { name: string; remoteUrl: string; personalAccessToken: string }) => {
    await createSync.mutateAsync(data)
    setIsFormOpen(false)
  }

  const handleUpdate = async (data: { name: string; remoteUrl: string; personalAccessToken?: string }) => {
    if (!editingSync) return
    await updateSync.mutateAsync({
      syncId: editingSync.id,
      input: data,
    })
    setEditingSync(null)
  }

  const handleDelete = async (syncId: string) => {
    if (confirm('Are you sure you want to remove this external sync?')) {
      await deleteSync.mutateAsync(syncId)
    }
  }

  const handleToggleEnabled = async (sync: ExternalSync) => {
    await updateSync.mutateAsync({
      syncId: sync.id,
      input: { syncEnabled: !sync.syncEnabled },
    })
  }

  const handleTestConnection = async (remoteUrl: string, personalAccessToken: string) => {
    return testConnection.mutateAsync({ remoteUrl, personalAccessToken })
  }

  const handlePush = async (syncId: string) => {
    await triggerPush.mutateAsync(syncId)
  }

  if (!isOpen) return null

  const showForm = isFormOpen || editingSync !== null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-canvas rounded-2xl shadow-2xl border border-outline w-full max-w-lg max-h-[80vh] flex flex-col animate-[scaleIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Git Sync</h2>
            <p className="text-sm text-foreground-muted">
              {syncs?.length ?? 0} external {syncs?.length === 1 ? 'repo' : 'repos'} configured
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-block-highlight transition-colors cursor-pointer"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-lg text-foreground"></i>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {showForm ? (
            <ExternalSyncForm
              initialData={editingSync ?? undefined}
              onSubmit={editingSync ? handleUpdate : handleCreate}
              onCancel={() => {
                setIsFormOpen(false)
                setEditingSync(null)
              }}
              onTestConnection={handleTestConnection}
              isSubmitting={createSync.isPending || updateSync.isPending}
              isTesting={testConnection.isPending}
            />
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <i className="fa-solid fa-spinner fa-spin text-2xl text-foreground-muted"></i>
            </div>
          ) : syncs && syncs.length > 0 ? (
            <div className="space-y-3">
              {syncs.map((sync) => (
                <ExternalSyncCard
                  key={sync.id}
                  sync={sync}
                  onEdit={() => setEditingSync(sync)}
                  onDelete={() => handleDelete(sync.id)}
                  onToggleEnabled={() => handleToggleEnabled(sync)}
                  onPush={() => handlePush(sync.id)}
                  isPushing={triggerPush.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-foreground-muted">
              <i className="fa-brands fa-git-alt text-4xl mb-3"></i>
              <p className="mb-4">No external repos configured</p>
              <button
                onClick={() => setIsFormOpen(true)}
                className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
              >
                Add Repository
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!showForm && syncs && syncs.length > 0 && (
          <div className="px-6 py-4 border-t border-outline">
            <button
              onClick={() => setIsFormOpen(true)}
              className="w-full px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-plus"></i>
              Add Repository
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

**File:** `frontend/src/components/ui/ExternalGitSyncModal/ExternalSyncCard.tsx`

```typescript
import type { ExternalSync } from '@/api/externalSyncs'

interface ExternalSyncCardProps {
  sync: ExternalSync
  onEdit: () => void
  onDelete: () => void
  onToggleEnabled: () => void
  onPush: () => void
  isPushing: boolean
}

export function ExternalSyncCard({
  sync,
  onEdit,
  onDelete,
  onToggleEnabled,
  onPush,
  isPushing,
}: ExternalSyncCardProps) {
  const getStatusIcon = () => {
    switch (sync.syncStatus) {
      case 'syncing':
        return <i className="fa-solid fa-spinner fa-spin text-blue-400"></i>
      case 'success':
        return <i className="fa-solid fa-check text-green-400"></i>
      case 'error':
        return <i className="fa-solid fa-exclamation-triangle text-red-400"></i>
      default:
        return <i className="fa-solid fa-clock text-foreground-muted"></i>
    }
  }

  const getStatusText = () => {
    if (sync.syncStatus === 'syncing') return 'Syncing...'
    if (sync.syncStatus === 'error') return sync.errorMessage || 'Sync failed'
    if (sync.lastSyncAt) {
      const date = new Date(sync.lastSyncAt)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1) return 'Synced just now'
      if (diffMins < 60) return `Synced ${diffMins}m ago`
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `Synced ${diffHours}h ago`
      return `Synced ${date.toLocaleDateString()}`
    }
    return 'Never synced'
  }

  // Extract repo info from URL
  const getRepoInfo = () => {
    try {
      const url = new URL(sync.remoteUrl)
      const pathParts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
      if (pathParts.length >= 2) {
        return `${url.hostname}/${pathParts.join('/')}`
      }
      return url.hostname + url.pathname
    } catch {
      return sync.remoteUrl
    }
  }

  return (
    <div className={`p-4 rounded-xl border ${sync.syncEnabled ? 'bg-block border-outline' : 'bg-block/50 border-outline/50 opacity-75'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <i className="fa-brands fa-git-alt text-foreground-muted"></i>
            <span className="font-medium text-foreground truncate">{sync.name}</span>
          </div>
          <div className="text-sm text-foreground-muted truncate mt-0.5">{getRepoInfo()}</div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-block-highlight transition-colors text-foreground-muted hover:text-foreground"
            title="Edit"
          >
            <i className="fa-solid fa-pen-to-square text-sm"></i>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-block-highlight transition-colors text-foreground-muted hover:text-red-400"
            title="Delete"
          >
            <i className="fa-solid fa-trash text-sm"></i>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2 text-sm">
          {getStatusIcon()}
          <span className={sync.syncStatus === 'error' ? 'text-red-400' : 'text-foreground-muted'}>
            {getStatusText()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleEnabled}
            className={`relative w-10 h-5 rounded-full transition-colors ${sync.syncEnabled ? 'bg-accent' : 'bg-foreground-muted/30'}`}
            title={sync.syncEnabled ? 'Disable sync' : 'Enable sync'}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${sync.syncEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <button
            onClick={onPush}
            disabled={isPushing || sync.syncStatus === 'syncing' || !sync.syncEnabled}
            className="px-2.5 py-1 text-sm rounded bg-block-highlight hover:bg-block-highlight/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Push now"
          >
            {isPushing || sync.syncStatus === 'syncing' ? (
              <i className="fa-solid fa-spinner fa-spin"></i>
            ) : (
              <i className="fa-solid fa-arrow-up"></i>
            )}
          </button>
        </div>
      </div>

      {/* Clone URL */}
      {sync.syncStatus === 'success' && sync.lastCommitHash && (
        <div className="mt-3 pt-3 border-t border-outline/50">
          <div className="text-xs text-foreground-muted mb-1">Clone URL:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-block-highlight px-2 py-1 rounded truncate">
              git clone {sync.remoteUrl}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(`git clone ${sync.remoteUrl}`)}
              className="p-1 rounded hover:bg-block-highlight text-foreground-muted hover:text-foreground transition-colors"
              title="Copy"
            >
              <i className="fa-solid fa-copy text-xs"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

**File:** `frontend/src/components/ui/ExternalGitSyncModal/ExternalSyncForm.tsx`

```typescript
import { useState } from 'react'
import type { ExternalSync } from '@/api/externalSyncs'

interface ExternalSyncFormProps {
  initialData?: ExternalSync
  onSubmit: (data: { name: string; remoteUrl: string; personalAccessToken?: string }) => Promise<void>
  onCancel: () => void
  onTestConnection: (remoteUrl: string, personalAccessToken: string) => Promise<{ success: boolean; error?: string }>
  isSubmitting: boolean
  isTesting: boolean
}

export function ExternalSyncForm({
  initialData,
  onSubmit,
  onCancel,
  onTestConnection,
  isSubmitting,
  isTesting,
}: ExternalSyncFormProps) {
  const [name, setName] = useState(initialData?.name ?? '')
  const [remoteUrl, setRemoteUrl] = useState(initialData?.remoteUrl ?? '')
  const [personalAccessToken, setPersonalAccessToken] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  const isEditing = !!initialData

  const handleTest = async () => {
    if (!remoteUrl || (!personalAccessToken && !isEditing)) {
      setTestResult({ success: false, error: 'URL and token are required' })
      return
    }

    const tokenToTest = personalAccessToken || (initialData ? '***' : '')
    if (tokenToTest === '***') {
      setTestResult({ success: false, error: 'Enter token to test connection' })
      return
    }

    setTestResult(null)
    const result = await onTestConnection(remoteUrl, personalAccessToken)
    setTestResult(result)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const data: { name: string; remoteUrl: string; personalAccessToken?: string } = {
      name,
      remoteUrl,
    }

    // Only include token if provided (for edits, empty means keep existing)
    if (personalAccessToken || !isEditing) {
      data.personalAccessToken = personalAccessToken
    }

    await onSubmit(data)
  }

  const isValid = name.trim() && remoteUrl.trim() && (isEditing || personalAccessToken.trim())

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., company-context"
          className="w-full px-3 py-2 bg-block border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-foreground placeholder:text-foreground-muted"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Repository URL</label>
        <input
          type="url"
          value={remoteUrl}
          onChange={(e) => {
            setRemoteUrl(e.target.value)
            setTestResult(null)
          }}
          placeholder="https://github.com/username/repo.git"
          className="w-full px-3 py-2 bg-block border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-foreground placeholder:text-foreground-muted"
          required
        />
        <p className="text-xs text-foreground-muted mt-1">Must be HTTPS URL ending with .git</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Personal Access Token
          {isEditing && <span className="text-foreground-muted font-normal"> (leave empty to keep current)</span>}
        </label>
        <input
          type="password"
          value={personalAccessToken}
          onChange={(e) => {
            setPersonalAccessToken(e.target.value)
            setTestResult(null)
          }}
          placeholder={isEditing ? '••••••••' : 'ghp_xxxxxxxxxxxx'}
          className="w-full px-3 py-2 bg-block border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-foreground placeholder:text-foreground-muted"
          required={!isEditing}
        />
        <p className="text-xs text-foreground-muted mt-1">
          GitHub: Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate with 'repo' scope
        </p>
      </div>

      {/* Test Connection */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={isTesting || !remoteUrl}
          className="px-3 py-1.5 text-sm bg-block-highlight rounded-lg hover:bg-block-highlight/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isTesting ? (
            <>
              <i className="fa-solid fa-spinner fa-spin mr-2"></i>
              Testing...
            </>
          ) : (
            <>
              <i className="fa-solid fa-plug mr-2"></i>
              Test Connection
            </>
          )}
        </button>
        {testResult && (
          <span className={testResult.success ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>
            {testResult.success ? (
              <>
                <i className="fa-solid fa-check mr-1"></i>
                Connection successful
              </>
            ) : (
              <>
                <i className="fa-solid fa-xmark mr-1"></i>
                {testResult.error}
              </>
            )}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-foreground-muted hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !isValid}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? (
            <>
              <i className="fa-solid fa-spinner fa-spin mr-2"></i>
              {isEditing ? 'Saving...' : 'Adding...'}
            </>
          ) : isEditing ? (
            'Save Changes'
          ) : (
            'Add Repository'
          )}
        </button>
      </div>
    </form>
  )
}
```

**File:** `frontend/src/components/ui/ExternalGitSyncModal/index.ts`

```typescript
export { ExternalGitSyncModal } from './ExternalGitSyncModal'
```

**Verify:** `cd frontend && pnpm build && pnpm test:smoke`

On success: `git commit -m "feat(git-sync): add ExternalGitSyncModal UI components"`

## Phase 11: Wire Up Modal to Settings

Add Git Sync button to workspace settings.

**Modify:** Find where settings/connections are accessed (likely `SettingsBar.tsx` or a menu) and add:

```typescript
import { ExternalGitSyncModal } from '@/components/ui/ExternalGitSyncModal'

// In component:
const [isGitSyncOpen, setIsGitSyncOpen] = useState(false)

// In render:
<button onClick={() => setIsGitSyncOpen(true)}>
  <i className="fa-brands fa-git-alt mr-2"></i>
  Git Sync
</button>

<ExternalGitSyncModal
  isOpen={isGitSyncOpen}
  onClose={() => setIsGitSyncOpen(false)}
  workspaceId={workspaceId}
/>
```

**Verify:** `cd frontend && pnpm build && pnpm test:smoke`

On success: `git commit -m "feat(git-sync): wire up Git Sync modal to settings UI"`

## Iteration Protocol

After each phase:

1. Run: `cd backend && pnpm build && pnpm test` (for backend phases)
2. Run: `cd frontend && pnpm build && pnpm test:smoke` (for frontend phases)
3. Run: `pnpm typecheck && pnpm lint` (from root)
4. If ALL pass: commit with descriptive message
5. If fail: fix before proceeding
6. Check which phases remain

## Known Gotchas

1. **Tuyau route syntax:** The generated Tuyau client uses chained methods. Check generated types in `frontend/src/api/.tuyau/` for exact syntax.

2. **DateTime import:** Use `DateTime` from `luxon`, not native JS Date, in backend models.

3. **serializeAs: null:** This prevents the column from appearing in JSON responses. Critical for tokens.

4. **Git authentication:** HTTPS with token in username works for GitHub, GitLab, Bitbucket. Format: `https://{token}@github.com/user/repo.git`

5. **Force push:** Using `git push -f` is intentional - the external repo is a mirror.

6. **Pre-existing lint errors:** There may be unused imports or variables in existing code. Focus on your changes.

## Runtime Gotchas

- **useSyncExternalStore:** Not used in this feature, but if polling status, ensure stable snapshot references.
- **Modal event propagation:** Always `e.stopPropagation()` on modal content div to prevent backdrop close.
- **Clipboard API:** `navigator.clipboard.writeText()` requires HTTPS in production.

## Failure Recovery

- If migration fails: `node ace migration:rollback` then fix and re-run
- If Tuyau types wrong: Delete `frontend/src/api/.tuyau/` and regenerate with `cd backend && pnpm codegen`
- If stuck on git operations: Test manually with `git ls-remote` first
- If tests fail for unrelated code: Note it, proceed if your changes are correct

## Completion Criteria

- [ ] Migration runs successfully: `cd backend && node ace migration:run`
- [ ] Backend builds: `cd backend && pnpm build`
- [ ] Backend tests pass: `cd backend && pnpm test`
- [ ] Frontend builds: `cd frontend && pnpm build`
- [ ] Frontend smoke tests pass: `cd frontend && pnpm test:smoke`
- [ ] Typecheck passes: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint`
- [ ] Can add external sync via UI
- [ ] Can test connection before saving
- [ ] Can see clone URL after successful sync
- [ ] Can manually trigger push
- [ ] Can enable/disable sync
- [ ] Can delete sync
- [ ] External sync triggers after workspace save (check backend logs)

## Completion Promise

<promise>EXTERNAL_GIT_SYNC_COMPLETE</promise>

Only output when ALL above criteria are TRUE.
