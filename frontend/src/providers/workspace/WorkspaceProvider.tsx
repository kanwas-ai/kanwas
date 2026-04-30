import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as Y from 'yjs'
import { createYjsProxy } from 'valtio-y'
import {
  createTextSelectionStore,
  TextSelectionContext,
  WorkspaceContext,
  type WorkspaceContextValue,
} from './WorkspaceContext'
import type { WorkspaceDocument, WorkspaceContentStore } from 'shared'
import { WorkspaceSocketProvider } from 'shared/workspace-provider'
import { createWorkspaceContentStore } from 'shared/workspace-content-store'
import { getOrCreateCorrelationId } from '@/lib/correlation-id'
import { WorkspaceUndoController } from '@/lib/workspaceUndo'
import { applyUserDisplayName, userIdentityManager } from '@/lib/userIdentity'
import { useAuthState } from '@/providers/auth'
import { useYjsSocketToken } from './useYjsSocketToken'

const INITIAL_SYNC_TIMEOUT_MS = 30_000

interface WorkspaceProviderProps {
  children: ReactNode
  workspaceId: string
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children, workspaceId }) => {
  const yDoc = useMemo(() => new Y.Doc(), [])
  const authState = useAuthState()
  const sessionUser = useMemo(() => userIdentityManager.getUser(), [])
  const localUser = useMemo(
    () => applyUserDisplayName(sessionUser, authState.user?.name),
    [authState.user?.name, sessionUser]
  )
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null)
  const [hasInitiallySynced, setHasInitiallySynced] = useState(false)
  const [initialSyncError, setInitialSyncError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null)
  const textSelectionStore = useMemo(() => createTextSelectionStore(), [])
  const cursorSuppressionTokensRef = useRef(new Set<symbol>())
  const yjsServerUrl = import.meta.env.VITE_YJS_SERVER_URL ?? 'localhost:1999'

  // Create valtio proxy that's automatically synced with Yjs
  // No bootstrap needed - the Yjs server will sync the data from backend
  const { proxy: store, dispose } = useMemo(() => {
    return createYjsProxy<WorkspaceDocument>(yDoc, {
      getRoot: (doc) => doc.getMap('state'),
    })
  }, [yDoc])

  const correlationId = useMemo(() => getOrCreateCorrelationId(), [])
  const {
    error: socketTokenError,
    getToken: getSocketToken,
    isReady: isSocketTokenReady,
  } = useYjsSocketToken(workspaceId)
  const getSocketTokenRef = useRef(getSocketToken)
  getSocketTokenRef.current = getSocketToken

  const provider = useMemo(() => {
    return new WorkspaceSocketProvider(yjsServerUrl, workspaceId, yDoc, {
      connect: false,
      params: () => ({
        clientKind: 'frontend',
        correlationId,
        socketToken: getSocketTokenRef.current() ?? null,
      }),
    })
  }, [correlationId, workspaceId, yDoc, yjsServerUrl])

  const contentStore = useMemo<WorkspaceContentStore>(() => {
    return createWorkspaceContentStore(yDoc)
  }, [yDoc])

  useEffect(() => {
    if (!isSocketTokenReady) {
      return
    }

    provider.connect()
  }, [isSocketTokenReady, provider])

  useEffect(() => {
    if (socketTokenError) {
      setInitialSyncError(`Workspace sync failed: ${socketTokenError.message}`)
    }
  }, [socketTokenError])

  // Track readiness state: hasInitiallySynced (one-way) and isConnected (live status)
  useEffect(() => {
    if (!isSocketTokenReady) {
      return
    }

    let lastConnectionErrorMessage: string | null = null
    let initialSyncCompleted = provider.synced

    const handleSync = (synced: boolean) => {
      if (synced) {
        initialSyncCompleted = true
        setInitialSyncError(null)
        setHasInitiallySynced(true) // Once true, never goes back to false
      }
    }

    const handleStatus = () => {
      setIsConnected(provider.connected)
      setIsReconnecting(provider.isReconnecting)
      setDisconnectReason(provider.lastDisconnectReason)
    }

    const handleConnectionError = (error: Error) => {
      lastConnectionErrorMessage = error.message
      if (!initialSyncCompleted) {
        setInitialSyncError(`Workspace sync failed: ${error.message}`)
      }
    }

    const timeoutId = window.setTimeout(() => {
      if (provider.synced) {
        return
      }

      setInitialSyncError(
        lastConnectionErrorMessage
          ? `Workspace sync timed out: ${lastConnectionErrorMessage}`
          : `Workspace sync timed out after ${INITIAL_SYNC_TIMEOUT_MS / 1000}s`
      )
    }, INITIAL_SYNC_TIMEOUT_MS)

    // Check current state immediately
    if (provider.synced) {
      initialSyncCompleted = true
      setInitialSyncError(null)
      setHasInitiallySynced(true)
    }
    setIsConnected(provider.connected)
    setIsReconnecting(provider.isReconnecting)
    setDisconnectReason(provider.lastDisconnectReason)

    provider.on('synced', handleSync)
    provider.on('sync', handleSync)
    provider.on('status', handleStatus)
    provider.on('connection-error', handleConnectionError)

    return () => {
      window.clearTimeout(timeoutId)
      provider.off('synced', handleSync)
      provider.off('sync', handleSync)
      provider.off('status', handleStatus)
      provider.off('connection-error', handleConnectionError)
    }
  }, [isSocketTokenReady, provider])

  useEffect(() => {
    const handleReload = () => {
      window.location.reload()
    }

    provider.on('reload', handleReload)
    return () => provider.off('reload', handleReload)
  }, [provider])

  const workspaceUndoController = useMemo(() => new WorkspaceUndoController(yDoc), [yDoc])
  const sharedEditorUndoManager = useMemo(
    () => workspaceUndoController.undoManager as unknown as Y.UndoManager,
    [workspaceUndoController]
  )

  const acquireCursorPresenceSuppression = useCallback(() => {
    const token = Symbol('cursor-presence-suppression')
    let released = false

    cursorSuppressionTokensRef.current.add(token)
    provider.awareness.setLocalStateField('appCursor', null)

    return () => {
      if (released) {
        return
      }

      released = true
      cursorSuppressionTokensRef.current.delete(token)
    }
  }, [provider])

  const isCursorPresenceSuppressed = useCallback(() => {
    return cursorSuppressionTokensRef.current.size > 0
  }, [])

  useEffect(() => {
    return () => {
      provider.destroy()
      workspaceUndoController.destroy()
      dispose()
      yDoc.destroy()
    }
  }, [provider, workspaceUndoController, yDoc, dispose])

  useEffect(() => {
    provider.awareness.setLocalStateField('appUser', localUser)
  }, [localUser, provider])

  useEffect(() => {
    const cursorSuppressionTokens = cursorSuppressionTokensRef.current

    return () => {
      cursorSuppressionTokens.clear()
      provider.awareness.setLocalStateField('appCursor', null)
      provider.awareness.setLocalStateField('appUser', null)
    }
  }, [provider])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      store,
      yDoc,
      provider,
      localUser,
      acquireCursorPresenceSuppression,
      isCursorPresenceSuppressed,
      contentStore,
      workspaceUndoController,
      sharedEditorUndoManager,
      hasInitiallySynced,
      initialSyncError,
      isConnected,
      isReconnecting,
      disconnectReason,
      workspaceId,
      activeCanvasId,
      setActiveCanvasId,
    }),
    [
      store,
      yDoc,
      provider,
      localUser,
      acquireCursorPresenceSuppression,
      isCursorPresenceSuppressed,
      contentStore,
      workspaceUndoController,
      sharedEditorUndoManager,
      hasInitiallySynced,
      initialSyncError,
      isConnected,
      isReconnecting,
      disconnectReason,
      workspaceId,
      activeCanvasId,
    ]
  )

  return (
    <WorkspaceContext.Provider value={value}>
      <TextSelectionContext.Provider value={textSelectionStore}>{children}</TextSelectionContext.Provider>
    </WorkspaceContext.Provider>
  )
}
