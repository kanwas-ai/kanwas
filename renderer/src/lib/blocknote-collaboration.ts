import { useEffect, useMemo } from 'react'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

export interface BlockNoteCollaborationProvider {
  awareness: Awareness
}

/**
 * BlockNote's Y.XmlFragment integration requires an awareness-shaped provider
 * even when Kanwas has no presence or collaboration features. This adapter is
 * deliberately isolated: it is never connected to the workspace transport.
 */
export function useLocalBlockNoteCollaborationProvider(): BlockNoteCollaborationProvider {
  const provider = useMemo(() => {
    const doc = new Y.Doc()
    const awareness = new Awareness(doc)

    return {
      awareness,
      destroy() {
        awareness.destroy()
        doc.destroy()
      },
    }
  }, [])

  useEffect(() => {
    return () => {
      provider.destroy()
    }
  }, [provider])

  return provider
}
