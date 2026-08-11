import { randomBytes } from 'node:crypto'
import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import {
  buildDocumentSharePath,
  buildWorkspaceRootPath,
  type DocumentShareAccessMode,
  type DocumentShareOwnerState,
  type DocumentShareRecord,
  type DocumentShareSocketAccessResolveResult,
  type PublicDocumentShareResolveResult,
  type WorkspaceDocumentSharesState,
} from 'shared/document-share'
import DocumentShare from '#models/document_share'
import Workspace from '#models/workspace'
const ACTIVE_NOTE_UNIQUE_INDEX = 'document_shares_active_note_unique'
const LONG_HASH_UNIQUE_INDEX = 'document_shares_long_hash_id_unique'
const MAX_CREATE_RETRIES = 10

export class DocumentShareNotFoundError extends Error {
  constructor() {
    super('Share not found')
    this.name = 'DocumentShareNotFoundError'
  }
}

@inject()
export default class DocumentShareService {
  async getOwnerShareState(
    workspaceId: string,
    noteId: string,
    _options: { correlationId?: string } = {}
  ): Promise<DocumentShareOwnerState> {
    const share = await DocumentShare.query()
      .where('workspace_id', workspaceId)
      .where('note_id', noteId)
      .whereNull('revoked_at')
      .first()

    return this.buildOwnerState(workspaceId, noteId, share)
  }

  async listActiveSharesForWorkspace(
    workspaceId: string,
    _options: { correlationId?: string } = {}
  ): Promise<WorkspaceDocumentSharesState> {
    const shares = await DocumentShare.query()
      .where('workspace_id', workspaceId)
      .whereNull('revoked_at')
      .orderBy('created_at', 'desc')

    if (shares.length === 0) {
      return {
        workspaceId,
        shares: [],
      }
    }

    return {
      workspaceId,
      shares: shares.map((share) => this.serializeShareRecord(share)),
    }
  }

  async createOrUpdateShare(
    workspaceId: string,
    noteId: string,
    createdByUserId: string,
    name: string,
    accessMode: DocumentShareAccessMode,
    _options: { correlationId?: string } = {}
  ): Promise<DocumentShareOwnerState> {
    const shareName = name.trim()

    for (let attempt = 0; attempt < MAX_CREATE_RETRIES; attempt++) {
      try {
        return await db.transaction(async (trx) => {
          const existing = await this.findActiveShareForUpdate(workspaceId, noteId, trx)

          if (existing) {
            if (existing.name !== shareName || existing.accessMode !== accessMode) {
              existing.name = shareName
              existing.accessMode = accessMode
              await existing.save()
            }

            return this.buildOwnerState(workspaceId, noteId, existing)
          }

          const share = await DocumentShare.create(
            {
              workspaceId,
              noteId,
              createdByUserId,
              name: shareName,
              longHashId: this.generateLongHashId(),
              accessMode,
            },
            { client: trx }
          )

          return this.buildOwnerState(workspaceId, noteId, share)
        })
      } catch (error) {
        if (this.isRetryableCreateConflict(error)) {
          continue
        }

        throw error
      }
    }

    throw new Error(`Failed to create document share for note ${noteId} after ${MAX_CREATE_RETRIES} attempts`)
  }

  async updateShare(
    workspaceId: string,
    noteId: string,
    name: string,
    accessMode: DocumentShareAccessMode,
    _options: { correlationId?: string } = {}
  ): Promise<DocumentShareOwnerState> {
    const shareName = name.trim()

    return db.transaction(async (trx) => {
      const share = await this.findActiveShareForUpdate(workspaceId, noteId, trx)

      if (!share) {
        throw new DocumentShareNotFoundError()
      }

      if (share.name !== shareName || share.accessMode !== accessMode) {
        share.name = shareName
        share.accessMode = accessMode
        await share.save()
      }

      return this.buildOwnerState(workspaceId, noteId, share)
    })
  }

  async revokeShare(
    workspaceId: string,
    noteId: string,
    _options: { correlationId?: string } = {}
  ): Promise<DocumentShareOwnerState> {
    await this.revokeActiveShareForNote(workspaceId, noteId)
    return this.buildOwnerState(workspaceId, noteId, null)
  }

  async resolvePublicShare(longHashId: string): Promise<PublicDocumentShareResolveResult> {
    const share = await DocumentShare.query().where('long_hash_id', longHashId).first()
    const publicPath = buildDocumentSharePath(longHashId)

    if (!share) {
      return {
        longHashId,
        publicPath,
        active: false,
        revoked: false,
        status: 'not_found',
      }
    }

    const workspaceRedirectPath = buildWorkspaceRootPath(share.workspaceId)

    if (share.revokedAt) {
      return {
        longHashId,
        workspaceId: share.workspaceId,
        noteId: share.noteId,
        name: share.name,
        accessMode: share.accessMode,
        publicPath,
        workspaceRedirectPath,
        active: false,
        revoked: true,
        status: 'revoked',
      }
    }

    const workspace = await Workspace.find(share.workspaceId)

    if (!workspace) {
      await this.revokeActiveShareForNote(share.workspaceId, share.noteId)
      return {
        longHashId,
        workspaceId: share.workspaceId,
        noteId: share.noteId,
        name: share.name,
        accessMode: share.accessMode,
        publicPath,
        workspaceRedirectPath,
        active: false,
        revoked: true,
        status: 'revoked',
      }
    }

    return {
      longHashId,
      workspaceId: share.workspaceId,
      noteId: share.noteId,
      name: share.name,
      accessMode: share.accessMode,
      publicPath,
      workspaceRedirectPath,
      active: true,
      revoked: false,
      status: 'active',
    }
  }

  async resolveSocketShareAccess(
    longHashId: string,
    _options: { correlationId?: string } = {}
  ): Promise<DocumentShareSocketAccessResolveResult> {
    const share = await DocumentShare.query().where('long_hash_id', longHashId).first()

    if (!share) {
      return {
        longHashId,
        active: false,
        revoked: false,
        status: 'not_found',
      }
    }

    if (share.revokedAt) {
      return {
        longHashId: share.longHashId,
        workspaceId: share.workspaceId,
        noteId: share.noteId,
        accessMode: share.accessMode,
        active: false,
        revoked: true,
        status: 'revoked',
      }
    }

    return {
      longHashId: share.longHashId,
      workspaceId: share.workspaceId,
      noteId: share.noteId,
      accessMode: share.accessMode,
      active: true,
      revoked: false,
      status: 'active',
    }
  }

  private async findActiveShareForUpdate(
    workspaceId: string,
    noteId: string,
    trx: TransactionClientContract
  ): Promise<DocumentShare | null> {
    return DocumentShare.query({ client: trx })
      .where('workspace_id', workspaceId)
      .where('note_id', noteId)
      .whereNull('revoked_at')
      .forUpdate()
      .first()
  }

  private async revokeActiveShareForNote(workspaceId: string, noteId: string): Promise<void> {
    await db.transaction(async (trx) => {
      const share = await this.findActiveShareForUpdate(workspaceId, noteId, trx)

      if (share && !share.revokedAt) {
        share.revokedAt = DateTime.utc()
        await share.save()
      }
    })
  }

  private buildOwnerState(workspaceId: string, noteId: string, share: DocumentShare | null): DocumentShareOwnerState {
    return {
      workspaceId,
      noteId,
      workspaceRedirectPath: buildWorkspaceRootPath(workspaceId),
      active: share !== null,
      share: share ? this.serializeShareRecord(share) : null,
    }
  }

  private serializeShareRecord(share: DocumentShare): DocumentShareRecord {
    return {
      id: share.id,
      workspaceId: share.workspaceId,
      noteId: share.noteId,
      name: share.name,
      createdByUserId: share.createdByUserId,
      longHashId: share.longHashId,
      accessMode: share.accessMode,
      publicPath: buildDocumentSharePath(share.longHashId),
      workspaceRedirectPath: buildWorkspaceRootPath(share.workspaceId),
      createdAt: this.toIsoString(share.createdAt),
      updatedAt: this.toIsoString(share.updatedAt),
    }
  }

  private toIsoString(value: DateTime): string {
    return value.toUTC().toISO() ?? value.toJSDate().toISOString()
  }

  private generateLongHashId(): string {
    return randomBytes(16).toString('base64url')
  }

  private isRetryableCreateConflict(error: unknown): boolean {
    return (
      this.isUniqueConstraintError(error, ACTIVE_NOTE_UNIQUE_INDEX) ||
      this.isUniqueConstraintError(error, LONG_HASH_UNIQUE_INDEX)
    )
  }

  private isUniqueConstraintError(error: unknown, constraintName: string): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const dbError = error as {
      code?: string
      constraint?: string
      detail?: string
    }

    if (dbError.code !== '23505') {
      return false
    }

    if (dbError.constraint === constraintName) {
      return true
    }

    return typeof dbError.detail === 'string' && dbError.detail.includes(constraintName)
  }
}
