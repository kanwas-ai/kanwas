import { io, type Socket } from 'socket.io-client'
import {
  getAuthParams,
  installWebSocketPolyfill,
  normalizeServerUrl,
  type ProviderParams,
} from './socketio-provider-utils.js'

const MAX_SERVER_DISCONNECT_RECONNECT_ATTEMPTS = 3
const SERVER_DISCONNECT_RECONNECT_DELAY_MS = 250

export type ProviderStatus = 'connecting' | 'connected' | 'disconnected'

export interface ProviderStatusEvent {
  status: ProviderStatus
}

export interface ProviderReloadEvent {
  reason: string
}

export interface SyncProviderOptions {
  connect?: boolean
  protocol?: 'ws' | 'wss'
  path?: string
  params?: ProviderParams
  WebSocketPolyfill?: typeof globalThis.WebSocket
}

export interface SyncProviderEventMap {
  'sync': [boolean]
  'synced': [boolean]
  'status': [ProviderStatusEvent]
  'connection-error': [Error]
  'reload': [ProviderReloadEvent]
}

type ProviderEventName = keyof SyncProviderEventMap

interface ReadyWaiter {
  reject: (error: Error) => void
  resolve: () => void
}

class TypedEmitter {
  private readonly listeners = new Map<ProviderEventName, Set<(...args: unknown[]) => void>>()

  on<K extends ProviderEventName>(event: K, callback: (...args: SyncProviderEventMap[K]) => void): void {
    const existing = this.listeners.get(event)
    if (existing) {
      existing.add(callback as (...args: unknown[]) => void)
      return
    }

    this.listeners.set(event, new Set([callback as (...args: unknown[]) => void]))
  }

  off<K extends ProviderEventName>(event: K, callback: (...args: SyncProviderEventMap[K]) => void): void {
    this.listeners.get(event)?.delete(callback as (...args: unknown[]) => void)
  }

  protected emit<K extends ProviderEventName>(event: K, ...args: SyncProviderEventMap[K]): void {
    const callbacks = this.listeners.get(event)
    if (!callbacks) {
      return
    }

    for (const callback of Array.from(callbacks)) {
      callback(...args)
    }
  }
}

export abstract class SocketSyncProviderBase extends TypedEmitter {
  readonly url: string
  readonly id: string

  shouldConnect: boolean
  synced = false
  connected = false
  socket: Socket | null = null

  private readonly syncWaiters = new Set<ReadyWaiter>()
  private readonly options: SyncProviderOptions
  private disconnectReason: string | null = null
  private hasSyncedAtLeastOnce = false
  private manualDisconnectRequested = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnecting = false
  private reloadRequested = false
  private serverDisconnectReconnectAttempts = 0
  private status: ProviderStatus = 'disconnected'

  protected constructor(host: string, id: string, options: SyncProviderOptions = {}) {
    super()

    this.id = id
    this.options = options
    this.url = normalizeServerUrl(host, options.protocol)
    this.shouldConnect = options.connect ?? true
  }

  whenSynced(): Promise<void> {
    if (this.synced) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      this.syncWaiters.add({ resolve, reject })
    })
  }

  get isReconnecting(): boolean {
    return this.reconnecting
  }

  get lastDisconnectReason(): string | null {
    return this.disconnectReason
  }

  connect(): void {
    this.shouldConnect = true
    this.disconnectReason = null
    this.manualDisconnectRequested = false
    this.reloadRequested = false
    this.reconnecting = false
    this.clearReconnectTimer()
    installWebSocketPolyfill(this.options.WebSocketPolyfill)

    if (!this.socket) {
      this.socket = io(this.url, {
        autoConnect: false,
        auth: (cb) => cb(this.buildSocketAuth()),
        path: this.options.path,
        reconnection: true,
        transports: ['websocket'],
      })

      this.socket.on('connect', this.handleSocketConnect)
      this.socket.on('disconnect', this.handleSocketDisconnect)
      this.socket.on('connect_error', this.handleConnectionError)
      this.registerSocketHandlers(this.socket)
    }

    this.setStatus('connecting')
    this.socket.connect()
  }

  disconnect(): void {
    this.shouldConnect = false
    this.manualDisconnectRequested = true
    this.reconnecting = false
    this.clearReconnectTimer()

    if (this.socket) {
      this.socket.disconnect()
    }

    if (!this.connected) {
      const shouldRefreshStatus = this.status === 'disconnected'
      this.applyDisconnectedState(this.createDisconnectBeforeSyncError())
      if (shouldRefreshStatus) {
        this.emitStatusSnapshot()
      }
    }
  }

  protected destroySocket(): void {
    if (!this.socket) {
      return
    }

    this.clearReconnectTimer()

    this.socket.off('connect', this.handleSocketConnect)
    this.socket.off('disconnect', this.handleSocketDisconnect)
    this.socket.off('connect_error', this.handleConnectionError)
    this.unregisterSocketHandlers(this.socket)
    this.socket.close()
    this.socket = null
  }

  protected setSynced(nextSynced: boolean): void {
    if (this.synced === nextSynced) {
      return
    }

    this.synced = nextSynced
    if (nextSynced) {
      this.hasSyncedAtLeastOnce = true
      this.serverDisconnectReconnectAttempts = 0
    }
    this.emit('sync', nextSynced)
    this.emit('synced', nextSynced)

    if (!nextSynced) {
      return
    }

    const waiters = Array.from(this.syncWaiters)
    this.syncWaiters.clear()
    for (const waiter of waiters) {
      waiter.resolve()
    }
  }

  protected markSynced(): void {
    this.setSynced(true)
  }

  protected emitReload(reason: string): void {
    this.emit('reload', { reason })
  }

  protected reportSyncFailure(error: Error): void {
    this.abortSyncWaiters(error)
    this.emit('connection-error', error)
  }

  protected abortSyncWaiters(error: Error): void {
    this.rejectSyncWaiters(error)
  }

  protected requestReload(reason: string, errorMessage?: string): void {
    this.markReloadRequested()
    this.emitReload(reason)
    if (!this.synced) {
      this.reportSyncFailure(new Error(errorMessage ?? reason))
    }
    this.socket?.disconnect()
  }

  protected markReloadRequested(): void {
    this.reloadRequested = true
    this.reconnecting = false
    this.clearReconnectTimer()
  }

  private readonly handleSocketConnect = (): void => {
    this.connected = true
    this.disconnectReason = null
    this.reconnecting = false
    this.clearReconnectTimer()
    this.setSynced(false)
    this.setStatus('connected')
    this.onConnected()
  }

  private readonly handleSocketDisconnect = (reason: string): void => {
    const shouldRefreshStatus = this.status === 'disconnected'
    const shouldReconnectAfterServerDisconnect = this.shouldReconnectAfterServerDisconnect(reason)

    this.disconnectReason = reason
    this.reconnecting = shouldReconnectAfterServerDisconnect || (this.shouldConnect && this.socket?.active === true)
    this.applyDisconnectedState(this.createDisconnectBeforeSyncError())

    if (shouldRefreshStatus) {
      this.emitStatusSnapshot()
    }

    if (shouldReconnectAfterServerDisconnect) {
      this.scheduleServerReconnect()
    }
  }

  private readonly handleConnectionError = (error: Error): void => {
    this.reconnecting = this.shouldConnect && this.socket?.active === true
    this.reportSyncFailure(error)

    if (!this.connected && !this.reconnecting) {
      if (this.status !== 'disconnected') {
        this.setStatus('disconnected')
      } else {
        this.emitStatusSnapshot()
      }
      return
    }

    this.emitStatusSnapshot()
  }

  private applyDisconnectedState(syncError: Error): void {
    this.connected = false
    this.clearRemoteAwareness()
    this.onDisconnected()

    if (!this.synced) {
      this.abortSyncWaiters(syncError)
    }

    this.setSynced(false)
    this.setStatus('disconnected')
  }

  private rejectSyncWaiters(error: Error): void {
    const waiters = Array.from(this.syncWaiters)
    this.syncWaiters.clear()
    for (const waiter of waiters) {
      waiter.reject(error)
    }
  }

  private shouldReconnectAfterServerDisconnect(reason: string): boolean {
    if (reason !== 'io server disconnect') {
      return false
    }

    if (!this.shouldConnect || this.manualDisconnectRequested || this.reloadRequested || !this.hasSyncedAtLeastOnce) {
      return false
    }

    return this.serverDisconnectReconnectAttempts < MAX_SERVER_DISCONNECT_RECONNECT_ATTEMPTS
  }

  private scheduleServerReconnect(): void {
    if (!this.socket) {
      return
    }

    this.serverDisconnectReconnectAttempts += 1
    const delayMs = this.serverDisconnectReconnectAttempts * SERVER_DISCONNECT_RECONNECT_DELAY_MS
    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null

      if (
        !this.socket ||
        this.socket.connected ||
        !this.shouldConnect ||
        this.manualDisconnectRequested ||
        this.reloadRequested
      ) {
        return
      }

      this.setStatus('connecting')
      this.socket.connect()
    }, delayMs)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return
    }

    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private setStatus(nextStatus: ProviderStatus): void {
    if (this.status === nextStatus) {
      return
    }

    this.status = nextStatus
    this.emitStatusSnapshot()
  }

  private emitStatusSnapshot(): void {
    this.emit('status', { status: this.status })
  }

  protected buildBaseSocketAuth(): Record<string, unknown> {
    return {
      ...getAuthParams(this.options.params),
    }
  }

  protected abstract buildSocketAuth(): Record<string, unknown>
  protected abstract clearRemoteAwareness(): void
  protected abstract createDestroyBeforeSyncError(): Error
  protected abstract createDisconnectBeforeSyncError(): Error
  protected abstract onConnected(): void
  protected abstract onDisconnected(): void
  protected abstract registerSocketHandlers(socket: Socket): void
  protected abstract unregisterSocketHandlers(socket: Socket): void
}
