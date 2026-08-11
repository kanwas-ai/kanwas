import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useGetEditor } from '@/providers/project-state'

type TextMatch = { pos: number; nodePos: number; score: number; text: string }

/**
 * Applies search highlight to matched content inside a BlockNote node.
 * Must be inside ReactFlowProvider and ProjectStateProvider.
 *
 * After the node is focused/zoomed, this component:
 * 1. Finds the best text match in the editor
 * 2. Selects the matching block/paragraph (yellow highlight via persist-selection-highlight)
 * 3. Scrolls the viewport if the match is off-screen
 */
export function SearchHighlighter({
  pendingHighlight,
  onComplete,
}: {
  pendingHighlight: { nodeId: string; query: string } | null
  onComplete: () => void
}) {
  const getEditor = useGetEditor()
  const { getViewport, setViewport } = useReactFlow()

  useEffect(() => {
    if (!pendingHighlight) return

    const { nodeId, query } = pendingHighlight

    // Try to apply highlight with a small delay to let the editor mount
    const timeoutId = setTimeout(() => {
      const editor = getEditor(nodeId)
      if (editor) {
        const tiptap = editor._tiptapEditor
        const doc = tiptap.state.doc
        const queryLower = query.toLowerCase()

        // Find the best match where query words appear together
        let foundPos: { from: number; to: number } | null = null
        let blockRange: { from: number; to: number } | null = null
        const queryWords = query
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2)

        const findBestMatch = (): TextMatch | null => {
          let currentBestMatch: TextMatch | null = null

          doc.descendants((node, pos) => {
            if (node.isText && node.text) {
              const textLower = node.text.toLowerCase()

              // Try exact phrase match first (highest priority)
              const exactIndex = textLower.indexOf(queryLower)
              if (exactIndex !== -1) {
                currentBestMatch = { pos: exactIndex, nodePos: pos, score: 1000, text: node.text }
                return false // Stop searching
              }

              // Score each occurrence of each word by nearby word count
              for (const word of queryWords) {
                let searchStart = 0
                while (true) {
                  const wordIndex = textLower.indexOf(word, searchStart)
                  if (wordIndex === -1) break

                  // Count how many query words are nearby (within 50 chars)
                  let score = 0
                  const windowStart = Math.max(0, wordIndex - 25)
                  const windowEnd = Math.min(textLower.length, wordIndex + 50)
                  const window = textLower.slice(windowStart, windowEnd)
                  for (const otherWord of queryWords) {
                    if (window.includes(otherWord)) score++
                  }

                  if (!currentBestMatch || score > currentBestMatch.score) {
                    currentBestMatch = { pos: wordIndex, nodePos: pos, score, text: node.text }
                  }

                  searchStart = wordIndex + 1
                }
              }
            }
          })

          return currentBestMatch
        }

        const bestMatch = findBestMatch()

        if (bestMatch) {
          foundPos = { from: bestMatch.nodePos + bestMatch.pos, to: bestMatch.nodePos + bestMatch.pos + 1 }
          // Find the parent block node to select the whole paragraph/line
          const resolvedPos = doc.resolve(bestMatch.nodePos)
          for (let depth = resolvedPos.depth; depth >= 0; depth--) {
            const parentNode = resolvedPos.node(depth)
            if (parentNode.isBlock && parentNode.type.name !== 'doc') {
              const start = resolvedPos.start(depth)
              const end = resolvedPos.end(depth)
              blockRange = { from: start, to: end }
              break
            }
          }
        }

        if (foundPos && blockRange) {
          // Get screen coordinates of the matched text before focus/blur
          const coords = tiptap.view.coordsAtPos(blockRange.from)

          // Focus editor, select the whole block/paragraph, then blur
          // The persist-selection-highlight will show the yellow highlight when blurred
          tiptap.chain().focus().setTextSelection(blockRange).blur().run()

          // If matched text is outside visible area, scroll viewport to show it
          const viewport = getViewport()
          const targetScreenY = 200
          if (coords.top > window.innerHeight - 100 || coords.top < 100) {
            setViewport(
              { x: viewport.x, y: viewport.y - (coords.top - targetScreenY), zoom: viewport.zoom },
              { duration: 0 }
            )
          }
        }
      }
      onComplete()
    }, 300) // Wait for editor to mount and node to be visible

    return () => clearTimeout(timeoutId)
  }, [pendingHighlight, getEditor, onComplete, getViewport, setViewport])

  return null
}
