import { useCallback, useEffect, useRef } from 'react'
import MiniSearch from 'minisearch'
import type { CanvasItem, NodeItem } from 'shared'
import type { WorkspaceContentStore } from 'shared'
import * as Y from 'yjs'
import { getPlainTextFromNodeContent } from '@/lib/blockNotePlainText'
import { findWorkspaceNotesMap } from '@/lib/workspaceNoteDoc'

export interface SearchResult {
  id: string
  type: 'canvas' | 'node'
  name: string
  canvasId: string
  canvasName: string
  content?: string
  score: number
  matchType: 'name' | 'content'
}

interface IndexedItem {
  id: string
  type: 'canvas' | 'node'
  name: string
  canvasId: string
  canvasName: string
  content: string
}

/**
 * Recursively collect all items (canvases and nodes) from the workspace tree
 */
function collectItems(
  canvas: CanvasItem,
  contentStore: WorkspaceContentStore,
  parentCanvasName = 'Root'
): IndexedItem[] {
  const items: IndexedItem[] = []

  // Add the canvas itself (skip root)
  if (canvas.id !== 'root') {
    items.push({
      id: canvas.id,
      type: 'canvas',
      name: canvas.name,
      canvasId: canvas.id,
      canvasName: parentCanvasName,
      content: '',
    })
  }

  // Process items in this canvas
  for (const item of canvas.items) {
    if (item.kind === 'node') {
      const node = item as NodeItem
      const content = getPlainTextFromNodeContent(node, contentStore)

      items.push({
        id: node.id,
        type: 'node',
        name: node.name,
        canvasId: canvas.id,
        canvasName: canvas.name,
        content: content.slice(0, 5000), // Limit content length for performance
      })
    } else if (item.kind === 'canvas') {
      // Recursively process nested canvases
      const nestedItems = collectItems(item as CanvasItem, contentStore, canvas.name)
      items.push(...nestedItems)
    }
  }

  return items
}

export function useWorkspaceSearch(
  root: CanvasItem | null,
  yDoc: Y.Doc | null,
  contentStore: WorkspaceContentStore | null,
  enabled = true
) {
  const searchIndexRef = useRef<MiniSearch<IndexedItem> | null>(null)
  const itemsMapRef = useRef<Map<string, IndexedItem>>(new Map())

  // Build search index when workspace data changes
  const buildIndex = useCallback(() => {
    if (!enabled || !root || !contentStore) return

    const items = collectItems(root, contentStore)

    // Create new MiniSearch instance
    const miniSearch = new MiniSearch<IndexedItem>({
      fields: ['name', 'content'],
      storeFields: ['id', 'type', 'name', 'canvasId', 'canvasName', 'content'],
      searchOptions: {
        boost: { name: 2 }, // Name matches rank higher
        fuzzy: 0.2,
        prefix: true,
      },
    })

    miniSearch.addAll(items)
    searchIndexRef.current = miniSearch

    // Build lookup map
    const map = new Map<string, IndexedItem>()
    for (const item of items) {
      map.set(item.id, item)
    }
    itemsMapRef.current = map
  }, [enabled, root, contentStore])

  // Rebuild index when root changes
  useEffect(() => {
    buildIndex()
  }, [buildIndex])

  useEffect(() => {
    if (!enabled || !root || !yDoc) {
      return
    }

    const rebuild = () => buildIndex()
    const notesMap = findWorkspaceNotesMap(yDoc)
    if (!notesMap) {
      return
    }

    const observedNoteDocs = new Map<Y.Doc, () => void>()

    const syncNoteObservers = () => {
      const currentNoteDocs = new Set(Array.from(notesMap.values()))

      for (const noteDoc of currentNoteDocs) {
        if (observedNoteDocs.has(noteDoc)) {
          continue
        }

        const handleNoteTransaction = () => rebuild()
        noteDoc.on('afterTransaction', handleNoteTransaction)
        observedNoteDocs.set(noteDoc, () => {
          noteDoc.off('afterTransaction', handleNoteTransaction)
        })
      }

      for (const [noteDoc, teardown] of Array.from(observedNoteDocs.entries())) {
        if (currentNoteDocs.has(noteDoc)) {
          continue
        }

        teardown()
        observedNoteDocs.delete(noteDoc)
      }
    }

    const handleNotesMapChange = () => {
      syncNoteObservers()
      rebuild()
    }

    syncNoteObservers()
    notesMap.observe(handleNotesMapChange)

    return () => {
      notesMap.unobserve(handleNotesMapChange)

      for (const teardown of observedNoteDocs.values()) {
        teardown()
      }
    }
  }, [buildIndex, enabled, root, yDoc])

  // Search function - returns results grouped by match type (name first, then content)
  const search = useCallback((query: string): SearchResult[] => {
    if (!query.trim() || !searchIndexRef.current) {
      return []
    }

    const queryLower = query.toLowerCase()
    const results = searchIndexRef.current.search(query).slice(0, 30)

    // Determine if match is in name or content
    const withMatchType = results.map((result) => {
      const nameLower = (result.name as string).toLowerCase()
      const matchType = nameLower.includes(queryLower) ? 'name' : 'content'
      return {
        id: result.id,
        type: result.type as 'canvas' | 'node',
        name: result.name as string,
        canvasId: result.canvasId as string,
        canvasName: result.canvasName as string,
        content: result.content as string | undefined,
        score: result.score,
        matchType: matchType as 'name' | 'content',
      }
    })

    // Sort: name matches first, then content matches
    return withMatchType.sort((a, b) => {
      if (a.matchType !== b.matchType) {
        return a.matchType === 'name' ? -1 : 1
      }
      return b.score - a.score
    })
  }, [])

  // Get all items (for showing when query is empty)
  const getAllItems = useCallback((): SearchResult[] => {
    const items = Array.from(itemsMapRef.current.values())
    // Show nodes first, then canvases, limit to 15
    const sorted = items.sort((a, b) => {
      // Nodes before canvases
      if (a.type !== b.type) return a.type === 'node' ? -1 : 1
      // Then by name
      return a.name.localeCompare(b.name)
    })
    return sorted.slice(0, 15).map((item) => ({
      ...item,
      score: 0,
      matchType: 'name' as const,
    }))
  }, [])

  return {
    search,
    getAllItems,
    rebuildIndex: buildIndex,
  }
}
