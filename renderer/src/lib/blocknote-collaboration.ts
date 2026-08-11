import { useEffect, useMemo } from 'react'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

export interface BlockNoteCollaborationProvider {
  awareness: Awareness
}

export function useIsolatedBlockNoteCollaborationProvider(
  templateProvider: BlockNoteCollaborationProvider,
  awarenessOverride?: Awareness | null
): BlockNoteCollaborationProvider {
  const fallbackProvider = useMemo(() => {
    const AwarenessConstructor = templateProvider.awareness.constructor as new (doc: Y.Doc) => Awareness
    const doc = new Y.Doc()
    const awareness = new AwarenessConstructor(doc)

    return {
      awareness,
      destroy() {
        awareness.destroy()
        doc.destroy()
      },
    }
  }, [templateProvider])

  useEffect(() => {
    return () => {
      fallbackProvider.destroy()
    }
  }, [fallbackProvider])

  return useMemo(() => {
    if (awarenessOverride) {
      return { awareness: awarenessOverride }
    }

    return fallbackProvider
  }, [awarenessOverride, fallbackProvider])
}
