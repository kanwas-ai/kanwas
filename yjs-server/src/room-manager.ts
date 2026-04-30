import type { BackendNotifier } from './backend-notifier.js'
import { getErrorLogContext } from './error-utils.js'
import type { Logger } from './logger.js'
import { getContextLogger, getContextSentryExtra, type OperationContext } from './operation-context.js'
import { captureException } from './sentry.js'
import type { DocumentStore } from './storage.js'
import { WorkspaceRoom, type ReplaceDocumentOptions, type WorkspaceSnapshotBundle } from './room.js'
import type { InitializeRoomOptions } from './room-types.js'

export interface RoomManagerOptions {
  backendNotifier: BackendNotifier
  logger: Logger
  saveDebounceMs: number
  store: DocumentStore
}

export class RoomManager {
  private readonly backendNotifier: BackendNotifier
  private readonly rooms = new Map<string, WorkspaceRoom>()
  private readonly destroyTasks = new Map<string, Promise<void>>()
  private readonly initTasks = new Map<string, Promise<WorkspaceRoom>>()
  private readonly log: Logger
  private readonly saveDebounceMs: number
  private readonly store: DocumentStore

  constructor(options: RoomManagerOptions) {
    this.backendNotifier = options.backendNotifier
    this.log = options.logger.child({ component: 'RoomManager' })
    this.saveDebounceMs = options.saveDebounceMs
    this.store = options.store
  }

  get activeRoomCount(): number {
    return this.rooms.size
  }

  async replaceDocument(
    workspaceId: string,
    snapshot: WorkspaceSnapshotBundle,
    options: ReplaceDocumentOptions,
    context?: OperationContext
  ): Promise<WorkspaceRoom> {
    const log = getContextLogger(this.log, context)

    const existingInitTask = this.initTasks.get(workspaceId)
    if (existingInitTask) {
      try {
        const room = await existingInitTask
        await room.replaceDocument(snapshot, options, context)
        return room
      } catch (error) {
        log.warn(
          { ...getErrorLogContext(error), workspaceId },
          'Retrying document replacement after failed room initialization'
        )
      }
    }

    const existingDestroyTask = this.destroyTasks.get(workspaceId)
    if (existingDestroyTask) {
      await existingDestroyTask
    }

    const existingRoom = this.rooms.get(workspaceId)
    if (existingRoom) {
      await existingRoom.replaceDocument(snapshot, options, context)
      return existingRoom
    }

    const room = new WorkspaceRoom({
      backendNotifier: this.backendNotifier,
      logger: this.log,
      saveDebounceMs: this.saveDebounceMs,
      store: this.store,
      workspaceId,
    })

    this.rooms.set(workspaceId, room)

    const replaceTask = room
      .replaceDocument(snapshot, options, context)
      .then(() => room)
      .catch((error) => {
        if (this.rooms.get(workspaceId) === room && room.connectionCount === 0) {
          this.rooms.delete(workspaceId)
        }

        throw error
      })
      .finally(() => {
        this.initTasks.delete(workspaceId)
      })

    this.initTasks.set(workspaceId, replaceTask)
    return replaceTask
  }

  async getRoom(
    workspaceId: string,
    options?: InitializeRoomOptions,
    context?: OperationContext
  ): Promise<WorkspaceRoom> {
    const existingInitTask = this.initTasks.get(workspaceId)
    if (existingInitTask) {
      return existingInitTask
    }

    const existingDestroyTask = this.destroyTasks.get(workspaceId)
    if (existingDestroyTask) {
      await existingDestroyTask
    }

    const existingRoom = this.rooms.get(workspaceId)
    if (existingRoom) {
      await existingRoom.initialize(options, context)
      return existingRoom
    }

    const room = new WorkspaceRoom({
      backendNotifier: this.backendNotifier,
      logger: this.log,
      saveDebounceMs: this.saveDebounceMs,
      store: this.store,
      workspaceId,
    })

    this.rooms.set(workspaceId, room)

    const initTask = room
      .initialize(options, context)
      .then(() => room)
      .catch((error) => {
        if (this.rooms.get(workspaceId) === room) {
          this.rooms.delete(workspaceId)
        }

        throw error
      })
      .finally(() => {
        this.initTasks.delete(workspaceId)
      })

    this.initTasks.set(workspaceId, initTask)
    return initTask
  }

  async destroyRoomIfEmpty(workspaceId: string, room?: WorkspaceRoom, context?: OperationContext): Promise<void> {
    const log = getContextLogger(this.log, context)
    const targetRoom = room ?? this.rooms.get(workspaceId)
    if (!targetRoom || targetRoom.connectionCount > 0) {
      return
    }

    const existingDestroyTask = this.destroyTasks.get(workspaceId)
    if (existingDestroyTask) {
      return existingDestroyTask
    }

    let destroyed = false

    const destroyTask = targetRoom
      .flushAndDestroy()
      .then(() => {
        destroyed = true
      })
      .catch((error) => {
        log.error({ ...getErrorLogContext(error), workspaceId }, 'Failed to destroy room cleanly')
        captureException(error, {
          ...getContextSentryExtra(context),
          stage: 'room_destroy',
          workspaceId,
        })

        throw error
      })
      .finally(() => {
        this.destroyTasks.delete(workspaceId)

        if (destroyed && this.rooms.get(workspaceId) === targetRoom && targetRoom.connectionCount === 0) {
          this.rooms.delete(workspaceId)
        }
      })

    this.destroyTasks.set(workspaceId, destroyTask)
    return destroyTask
  }

  async shutdown(): Promise<void> {
    await Promise.all(Array.from(this.rooms.values()).map((room) => room.flushAndDestroy()))
    this.destroyTasks.clear()
    this.initTasks.clear()
    this.rooms.clear()
  }
}
