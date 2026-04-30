import { decodeSnapshotDocument, type WorkspaceSnapshotBundle } from 'shared/server'
import { type Logger } from './logger.js'
import { getContextLogger, type OperationContext } from './operation-context.js'
import { migrateLegacyWorkspace } from './migrations/legacy_workspace_to_note_subdocs.js'
import type { DocumentStore, LegacyDocumentStore } from './storage.js'

export class MigratingDocumentStore implements DocumentStore {
  private readonly log: Logger
  private readonly migrationTasks = new Map<string, Promise<Uint8Array | null>>()

  constructor(
    private readonly store: LegacyDocumentStore,
    logger: Logger
  ) {
    this.log = logger.child({ component: 'MigratingDocumentStore' })
  }

  async loadRoot(workspaceId: string, context?: OperationContext): Promise<Uint8Array | null> {
    const rootBytes = await this.store.loadRoot(workspaceId, context)
    if (rootBytes) {
      return rootBytes
    }

    const existingTask = this.migrationTasks.get(workspaceId)
    if (existingTask) {
      return existingTask
    }

    const migrationTask = this.migrateWorkspaceIfNeeded(workspaceId, context).finally(() => {
      if (this.migrationTasks.get(workspaceId) === migrationTask) {
        this.migrationTasks.delete(workspaceId)
      }
    })

    this.migrationTasks.set(workspaceId, migrationTask)
    return migrationTask
  }

  async saveRoot(workspaceId: string, documentBytes: Uint8Array, context?: OperationContext): Promise<void> {
    await this.store.saveRoot(workspaceId, documentBytes, context)
  }

  async loadNote(workspaceId: string, noteId: string, context?: OperationContext): Promise<Uint8Array | null> {
    return this.store.loadNote(workspaceId, noteId, context)
  }

  async saveNote(
    workspaceId: string,
    noteId: string,
    documentBytes: Uint8Array,
    context?: OperationContext
  ): Promise<void> {
    await this.store.saveNote(workspaceId, noteId, documentBytes, context)
  }

  async deleteNote(workspaceId: string, noteId: string, context?: OperationContext): Promise<void> {
    await this.store.deleteNote(workspaceId, noteId, context)
  }

  private async migrateWorkspaceIfNeeded(workspaceId: string, context?: OperationContext): Promise<Uint8Array | null> {
    const log = getContextLogger(this.log.child({ workspaceId }), context)

    const currentRoot = await this.store.loadRoot(workspaceId, context)
    if (currentRoot) {
      return currentRoot
    }

    const legacyDocument = await this.store.loadLegacyDocument(workspaceId, context)
    if (!legacyDocument) {
      return null
    }

    log.info({}, 'Migrating legacy workspace storage to note subdocs')
    const migratedWorkspace = await migrateLegacyWorkspace(legacyDocument)

    for (const warning of migratedWorkspace.validation.warnings) {
      log.warn({ issue: warning.issue, noteId: warning.noteId }, 'Legacy workspace migration warning')
    }

    if (!migratedWorkspace.validation.valid) {
      log.error({ failures: migratedWorkspace.validation.failures }, 'Legacy workspace migration validation failed')
      throw new Error(`Workspace ${workspaceId} failed legacy note-subdoc migration validation`)
    }

    await writeWorkspaceSnapshot(this.store, workspaceId, migratedWorkspace.snapshot, context)

    log.info(
      {
        noteCount: Object.keys(migratedWorkspace.snapshot.notes).length,
        warningCount: migratedWorkspace.validation.warnings.length,
      },
      'Migrated legacy workspace storage to note subdocs'
    )

    return decodeSnapshotDocument(migratedWorkspace.snapshot.root)
  }
}

async function writeWorkspaceSnapshot(
  store: DocumentStore,
  workspaceId: string,
  snapshot: WorkspaceSnapshotBundle,
  context?: OperationContext
): Promise<void> {
  for (const noteId of Object.keys(snapshot.notes).sort()) {
    await store.saveNote(workspaceId, noteId, decodeSnapshotDocument(snapshot.notes[noteId]), context)
  }

  await store.saveRoot(workspaceId, decodeSnapshotDocument(snapshot.root), context)
}
