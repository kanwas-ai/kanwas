import React, { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as Y from 'yjs'
import { NoteSocketProvider } from 'shared/note-provider'
import { getOrCreateCorrelationId } from '@/lib/correlation-id'
import { PublicNoteContext, type PublicNoteContextValue } from './PublicNoteContext'

const INITIAL_SYNC_TIMEOUT_MS = 30_000

interface PublicNoteProviderProps {
  children: ReactNode
  workspaceId: string
  noteId: string
  longHashId: string
}

export const PublicNoteProvider: React.FC<PublicNoteProviderProps> = ({
  children,
  workspaceId,
  noteId,
  longHashId,
}) => {
  const yDoc = useMemo(() => new Y.Doc({ guid: noteId }), [noteId])
  const [hasInitiallySynced, setHasInitiallySynced] = useState(false)
  const [initialSyncError, setInitialSyncError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null)
  const yjsServerUrl = import.meta.env.VITE_YJS_SERVER_URL ?? 'localhost:1999'
  const correlationId = useMemo(() => getOrCreateCorrelationId(), [])

  const provider = useMemo(() => {
    return new NoteSocketProvider(yjsServerUrl, workspaceId, noteId, yDoc, {
      params: () => ({ correlationId, longHashId }),
    })
  }, [correlationId, longHashId, noteId, workspaceId, yDoc, yjsServerUrl])

  useEffect(() => {
    let lastConnectionErrorMessage: string | null = null
    let initialSyncCompleted = provider.synced

    const handleSync = (synced: boolean) => {
      if (synced) {
        initialSyncCompleted = true
        setInitialSyncError(null)
        setHasInitiallySynced(true)
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
        setInitialSyncError(`Shared note sync failed: ${error.message}`)
      }
    }

    const timeoutId = window.setTimeout(() => {
      if (provider.synced) {
        return
      }

      setInitialSyncError(
        lastConnectionErrorMessage
          ? `Shared note sync timed out: ${lastConnectionErrorMessage}`
          : `Shared note sync timed out after ${INITIAL_SYNC_TIMEOUT_MS / 1000}s`
      )
    }, INITIAL_SYNC_TIMEOUT_MS)

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
  }, [provider])

  useEffect(() => {
    const handleReload = () => {
      window.location.reload()
    }

    provider.on('reload', handleReload)
    return () => provider.off('reload', handleReload)
  }, [provider])

  useEffect(() => {
    return () => {
      provider.destroy()
      yDoc.destroy()
    }
  }, [provider, yDoc])

  const value = useMemo<PublicNoteContextValue>(
    () => ({
      yDoc,
      provider,
      workspaceId,
      noteId,
      longHashId,
      hasInitiallySynced,
      initialSyncError,
      isConnected,
      isReconnecting,
      disconnectReason,
    }),
    [
      disconnectReason,
      hasInitiallySynced,
      initialSyncError,
      isConnected,
      isReconnecting,
      longHashId,
      noteId,
      provider,
      workspaceId,
      yDoc,
    ]
  )

  return <PublicNoteContext.Provider value={value}>{children}</PublicNoteContext.Provider>
}
