import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { blockNoteSchema } from '@/lib/blocknote-schema'
import { createDetachedAgentCursorExtension } from '@/lib/detachedAgentCursorExtension'
import { getNextDetachedMarkdownReveal } from '@/components/note-editors/detachedMarkdownReveal'
import { useTheme } from '@/providers/theme'

const DETACHED_MARKDOWN_PARSE_INTERVAL_MS = 90

interface DetachedMarkdownBlockNoteProps {
  markdown: string
  minHeight?: string
}

export const DetachedMarkdownBlockNote = memo(function DetachedMarkdownBlockNote({
  markdown,
  minHeight = '60px',
}: DetachedMarkdownBlockNoteProps) {
  const { themeMode } = useTheme()
  const lastAppliedMarkdownRef = useRef<string | null>(null)
  const targetMarkdownRef = useRef(markdown)
  const visibleMarkdownRef = useRef(markdown)
  const lastRevealFrameAtRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastParsedAtRef = useRef(0)
  const lastRenderedMarkdownRef = useRef(markdown)
  const [renderMarkdown, setRenderMarkdown] = useState(markdown)
  const detachedAgentCursorExtension = useMemo(() => createDetachedAgentCursorExtension(), [])
  const editor = useCreateBlockNote({
    schema: blockNoteSchema,
    extensions: [detachedAgentCursorExtension],
    trailingBlock: true,
  })

  useEffect(() => {
    editor.isEditable = false
  }, [editor])

  useEffect(() => {
    targetMarkdownRef.current = markdown

    if (!markdown.startsWith(visibleMarkdownRef.current)) {
      visibleMarkdownRef.current = markdown
      lastRenderedMarkdownRef.current = markdown
      lastRevealFrameAtRef.current = null
      setRenderMarkdown(markdown)
      return
    }

    if (visibleMarkdownRef.current === markdown) {
      return
    }

    let cancelled = false

    const animate = (timestamp: number) => {
      if (cancelled) {
        return
      }

      const lastFrameAt = lastRevealFrameAtRef.current ?? timestamp
      const elapsedMs = Math.max(16, timestamp - lastFrameAt)
      lastRevealFrameAtRef.current = timestamp

      const nextVisibleMarkdown = getNextDetachedMarkdownReveal(
        visibleMarkdownRef.current,
        targetMarkdownRef.current,
        elapsedMs
      )

      if (nextVisibleMarkdown !== visibleMarkdownRef.current) {
        visibleMarkdownRef.current = nextVisibleMarkdown
      }

      const shouldParseNow =
        visibleMarkdownRef.current !== lastRenderedMarkdownRef.current &&
        (timestamp - lastParsedAtRef.current >= DETACHED_MARKDOWN_PARSE_INTERVAL_MS ||
          visibleMarkdownRef.current === targetMarkdownRef.current)

      if (shouldParseNow) {
        lastRenderedMarkdownRef.current = visibleMarkdownRef.current
        lastParsedAtRef.current = timestamp
        setRenderMarkdown(visibleMarkdownRef.current)
      }

      if (visibleMarkdownRef.current !== targetMarkdownRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(animate)
        return
      }

      animationFrameRef.current = null
      lastRevealFrameAtRef.current = null
    }

    animationFrameRef.current = window.requestAnimationFrame(animate)

    return () => {
      cancelled = true

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [markdown])

  useEffect(() => {
    if (lastAppliedMarkdownRef.current === renderMarkdown) {
      return
    }

    try {
      const blocks = editor.tryParseMarkdownToBlocks(renderMarkdown)
      editor.replaceBlocks(editor.topLevelBlocks, blocks)
      editor.isEditable = false
      lastAppliedMarkdownRef.current = renderMarkdown
    } catch {
      // Keep the previous rendered preview if a transient partial markdown frame is not parseable yet.
    }
  }, [editor, renderMarkdown])

  return (
    <div className="pointer-events-none select-none">
      <BlockNoteView
        style={{ minHeight }}
        editor={editor as never}
        theme={themeMode}
        editable={false}
        formattingToolbar={false}
        linkToolbar={false}
        slashMenu={false}
        sideMenu={false}
        filePanel={false}
        tableHandles={false}
        emojiPicker={false}
        comments={false}
      />
    </div>
  )
})
