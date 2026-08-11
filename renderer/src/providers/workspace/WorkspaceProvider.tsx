import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { baseURL } from '@/api/client'
import { LOCAL_USER_IDENTITY } from '@/lib/userIdentity'
import { useYjsSocketToken } from './useYjsSocketToken'

const INITIAL_SYNC_TIMEOUT_MS = 30_000
const SESSION_RECOVERY_GRACE_MS = 5_000
const SESSION_INTERRUPTED_MESSAGE = 'Local workspace session was interrupted. Reload Workspace to continue safely.'

interface WorkspaceProviderProps {
  children: ReactNode
  workspaceId: string
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children, workspaceId }) => {
  const yDoc = useMemo(() => new Y.Doc(), [])
  const localUser = LOCAL_USER_IDENTITY
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null)
  const [sessionState, setSessionState] = useState<WorkspaceContextValue['sessionState']>('opening')
  const [sessionError, setSessionError] = useState<string | null>(null)
  const textSelectionStore = useMemo(() => createTextSelectionStore(), [])
  const yjsServerUrl = baseURL

  // Create a Valtio proxy that's automatically synchronized by Yjs.
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
      path: '/yjs/socket.io',
      params: () => ({
        clientKind: 'renderer',
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
      setSessionError(`Could not start the local workspace session: ${socketTokenError.message}`)
    }
  }, [socketTokenError])

  // Present the embedded document channel as a local session, not as a remote service.
  useEffect(() => {
    if (!isSocketTokenReady) {
      return
    }

    let lastConnectionErrorMessage: string | null = null
    let initialSyncCompleted = provider.synced
    let reloadRequired = false
    let recoveryTimeoutId: number | null = null

    const clearRecoveryTimeout = () => {
      if (recoveryTimeoutId === null) {
        return
      }

      window.clearTimeout(recoveryTimeoutId)
      recoveryTimeoutId = null
    }

    const markReady = () => {
      if (reloadRequired) {
        return
      }

      clearRecoveryTimeout()
      setSessionError(null)
      setSessionState('ready')
    }

    const markRecovering = () => {
      if (!initialSyncCompleted || reloadRequired) {
        return
      }

      setSessionError(null)
      setSessionState('recovering')
      if (recoveryTimeoutId !== null) {
        return
      }

      recoveryTimeoutId = window.setTimeout(() => {
        recoveryTimeoutId = null
        if (provider.connected && provider.synced) {
          markReady()
          return
        }

        setSessionError(SESSION_INTERRUPTED_MESSAGE)
        setSessionState('interrupted')
      }, SESSION_RECOVERY_GRACE_MS)
    }

    const handleSync = (synced: boolean) => {
      if (synced) {
        initialSyncCompleted = true
        markReady()
      } else {
        markRecovering()
      }
    }

    const handleStatus = () => {
      if (provider.connected && provider.synced) {
        markReady()
      } else {
        markRecovering()
      }
    }

    const handleConnectionError = (error: Error) => {
      lastConnectionErrorMessage = error.message
      if (!initialSyncCompleted) {
        setSessionError(`Could not open the local workspace: ${error.message}`)
      } else {
        markRecovering()
      }
    }

    const handleReloadRequired = () => {
      reloadRequired = true
      clearRecoveryTimeout()
      setSessionError(SESSION_INTERRUPTED_MESSAGE)
      setSessionState('interrupted')
    }

    const timeoutId = window.setTimeout(() => {
      if (initialSyncCompleted || provider.synced) {
        return
      }

      setSessionError(
        lastConnectionErrorMessage
          ? `The local workspace did not open: ${lastConnectionErrorMessage}`
          : `The local workspace did not open within ${INITIAL_SYNC_TIMEOUT_MS / 1000} seconds.`
      )
    }, INITIAL_SYNC_TIMEOUT_MS)

    if (provider.synced) {
      initialSyncCompleted = true
      markReady()
    } else {
      setSessionState('opening')
    }

    provider.on('sync', handleSync)
    provider.on('status', handleStatus)
    provider.on('connection-error', handleConnectionError)
    provider.on('reload', handleReloadRequired)

    return () => {
      window.clearTimeout(timeoutId)
      clearRecoveryTimeout()
      provider.off('sync', handleSync)
      provider.off('status', handleStatus)
      provider.off('connection-error', handleConnectionError)
      provider.off('reload', handleReloadRequired)
    }
  }, [isSocketTokenReady, provider])

  const workspaceUndoController = useMemo(() => new WorkspaceUndoController(yDoc), [yDoc])
  const sharedEditorUndoManager = useMemo(
    () => workspaceUndoController.undoManager as unknown as Y.UndoManager,
    [workspaceUndoController]
  )

  useEffect(() => {
    return () => {
      provider.destroy()
      workspaceUndoController.destroy()
      dispose()
      yDoc.destroy()
    }
  }, [provider, workspaceUndoController, yDoc, dispose])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      store,
      yDoc,
      provider,
      localUser,
      contentStore,
      workspaceUndoController,
      sharedEditorUndoManager,
      sessionState,
      sessionError,
      workspaceId,
      activeCanvasId,
      setActiveCanvasId,
    }),
    [
      store,
      yDoc,
      provider,
      localUser,
      contentStore,
      workspaceUndoController,
      sharedEditorUndoManager,
      sessionState,
      sessionError,
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
