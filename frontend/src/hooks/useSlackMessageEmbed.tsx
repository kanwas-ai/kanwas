import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { GenericPopover, type DefaultReactSuggestionItem } from '@blocknote/react'
import { SlackPermalinkModal } from '@/components/canvas/SlackPermalinkModal'
import { SLACK_MESSAGE_TYPE } from '@/lib/slack-message-block-constants'
import type { SlackMessageData } from '@/api/slack'

interface UseSlackMessageEmbedResult {
  /** Slash-menu entry to merge into the editor's slash menu. */
  slashMenuItem: DefaultReactSuggestionItem
  /** Modal JSX to render alongside the editor. Null when closed. */
  modal: ReactNode
}

/**
 * Encapsulates the Slack-message-embed flow for a BlockNote editor:
 * the "/slack" slash menu entry, the floating modal for pasting a permalink,
 * and inserting the resulting block at the cursor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSlackMessageEmbed(editor: any, workspaceId: string): UseSlackMessageEmbedResult {
  const [anchorBlockId, setAnchorBlockId] = useState<string | null>(null)

  const reference = useMemo(() => {
    if (!anchorBlockId) return undefined
    return editor.transact(
      (tr: { doc: { descendants: (cb: (n: { attrs?: { id?: string } }, pos: number) => boolean | void) => void } }) => {
        let resolvedPos: number | null = null
        tr.doc.descendants((node, pos) => {
          if (resolvedPos !== null) return false
          if (node.attrs?.id === anchorBlockId) {
            resolvedPos = pos
            return false
          }
          return true
        })
        if (resolvedPos === null) return undefined
        const { node } = editor._tiptapEditor.view.domAtPos(resolvedPos + 1)
        if (node instanceof Element) return { element: node }
        return undefined
      }
    )
  }, [anchorBlockId, editor])

  const slashMenuItem = useMemo<DefaultReactSuggestionItem>(
    () => ({
      title: 'Slack Message',
      subtext: 'Embed a Slack message',
      group: 'Embeds',
      aliases: ['slack', 'message', 'embed'],
      icon: <i className="fa-brands fa-slack" />,
      onItemClick: () => {
        setAnchorBlockId(editor.getTextCursorPosition().block.id)
      },
    }),
    [editor]
  )

  const handleFetched = useCallback(
    (data: SlackMessageData) => {
      const cursorBlock = editor.getTextCursorPosition().block
      editor.insertBlocks([{ type: SLACK_MESSAGE_TYPE, props: { ...data } }], cursorBlock, 'after')
      setAnchorBlockId(null)
    },
    [editor]
  )

  const close = useCallback(() => setAnchorBlockId(null), [])

  const modal =
    anchorBlockId && reference ? (
      <GenericPopover
        reference={reference}
        useFloatingOptions={{
          open: true,
          onOpenChange: (open) => {
            if (!open) close()
          },
          placement: 'bottom-start',
          middleware: [{ name: 'offset', fn: ({ y, x }) => ({ x, y: y + 10 }) }],
        }}
        elementProps={{ style: { zIndex: 90 } }}
      >
        <SlackPermalinkModal isOpen onClose={close} onMessageFetched={handleFetched} workspaceId={workspaceId} />
      </GenericPopover>
    ) : null

  return { slashMenuItem, modal }
}
