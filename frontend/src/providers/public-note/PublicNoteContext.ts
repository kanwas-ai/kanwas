import { createContext, useContext } from 'react'
import type * as Y from 'yjs'
import type { NoteSocketProviderInstance } from 'shared/note-provider'

export interface PublicNoteContextValue {
  yDoc: Y.Doc
  provider: NoteSocketProviderInstance
  workspaceId: string
  noteId: string
  longHashId: string
  hasInitiallySynced: boolean
  initialSyncError: string | null
  isConnected: boolean
  isReconnecting: boolean
  disconnectReason: string | null
}

export const PublicNoteContext = createContext<PublicNoteContextValue | null>(null)

export function usePublicNote() {
  const context = useContext(PublicNoteContext)
  if (!context) {
    throw new Error('usePublicNote must be used within PublicNoteProvider')
  }

  return context
}
