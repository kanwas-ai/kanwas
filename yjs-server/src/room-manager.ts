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
  saveMaxWaitMs: number
  store: DocumentStore
}

export class RoomManager {
  private readonly backendNotifier: BackendNotifier
  private readonly rooms = new Map<string, WorkspaceRoom>()
  private readonly destroyTasks = new Map<string, Promise<void>>()
  private readonly initTasks = new Map<string, Promise<WorkspaceRoom>>()
  private readonly log: Logger
  private readonly saveDebounceMs: number
  private readonly saveMaxWaitMs: number
  private readonly store: DocumentStore

  constructor(options: RoomManagerOptions) {
    this.backendNotifier = options.backendNotifier
    this.log = options.logger.child({ component: 'RoomManager' })
    this.saveDebounceMs = options.saveDebounceMs
    this.saveMaxWaitMs = options.saveMaxWaitMs
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
      saveMaxWaitMs: this.saveMaxWaitMs,
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
      saveMaxWaitMs: this.saveMaxWaitMs,
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

  /**
   * Force-close a single room regardless of live connections (see
   * `WorkspaceRoom.closeImmediately`): every attached socket is disconnected and
   * the room is torn down and dropped from the manager. Additive-only — used by
   * local-daemon's `MountManager.unmount()` when a folder is unmounted; does not
   * change `destroyRoomIfEmpty` or `shutdown`. A no-op if the room doesn't exist.
   */
  async closeRoom(workspaceId: string): Promise<void> {
    const existingInitTask = this.initTasks.get(workspaceId)
    if (existingInitTask) {
      await existingInitTask.catch(() => undefined)
    }

    const existingDestroyTask = this.destroyTasks.get(workspaceId)
    if (existingDestroyTask) {
      // Already being destroyed (e.g. a natural destroyRoomIfEmpty race) —
      // nothing more to do.
      await existingDestroyTask
      return
    }

    const room = this.rooms.get(workspaceId)
    if (!room) {
      return
    }

    this.rooms.delete(workspaceId)

    // Register in `destroyTasks` BEFORE closing: `closeImmediately()` disconnects
    // every attached socket, and each of those sockets' own 'disconnect' handler
    // independently calls `destroyRoomIfEmpty(workspaceId, room, ...)` (see
    // socket-connection.ts). That call happens on a later tick (socket.io
    // disconnects aren't synchronous), so registering here first means it finds
    // this task already in flight and just awaits it — instead of racing a
    // second, uncoordinated `flushAndDestroy()` on the same room.
    const closeTask = room.closeImmediately().finally(() => {
      if (this.destroyTasks.get(workspaceId) === closeTask) {
        this.destroyTasks.delete(workspaceId)
      }
    })
    this.destroyTasks.set(workspaceId, closeTask)
    await closeTask
  }

  /**
   * Force a room's pending debounced save to run now, WITHOUT closing the room
   * (unlike `closeRoom`) — used by local-daemon's on-demand `POST
   * /workspaces/:id/flush` so an external CLI agent can be sure the room's latest
   * state has reached the `DocumentStore` (and from there, the still-bound
   * `FolderFlusher`) before it reads files off disk. A no-op if the room doesn't
   * exist or is still initializing and fails to come up.
   */
  async flushWorkspace(workspaceId: string): Promise<void> {
    const existingInitTask = this.initTasks.get(workspaceId)
    if (existingInitTask) {
      await existingInitTask.catch(() => undefined)
    }

    const room = this.rooms.get(workspaceId)
    if (!room) {
      return
    }

    await room.flushPendingSave()
  }

  async shutdown(): Promise<void> {
    await Promise.all(Array.from(this.rooms.values()).map((room) => room.flushAndDestroy()))
    this.destroyTasks.clear()
    this.initTasks.clear()
    this.rooms.clear()
  }
}
