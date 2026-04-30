import Mention from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import { MentionSuggestionList, type MentionSuggestionListRef } from './MentionSuggestionList'
import type { MentionItemData } from './useMentionItems'
import type { MutableRefObject } from 'react'

export function createMentionExtension(
  getItemsRef: MutableRefObject<(query: string) => MentionItemData[]>,
  activeCanvasIdRef: MutableRefObject<string | null>
) {
  return Mention.configure({
    HTMLAttributes: {
      class: 'mention-chip',
    },
    suggestion: {
      char: '@',
      items: ({ query }) => getItemsRef.current(query),
      command: ({ editor, range, props }) => {
        const item = props as unknown as MentionItemData
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: 'mention', attrs: { id: item.id, label: item.name } },
            { type: 'text', text: ' ' },
          ])
          .run()
      },
      render: () => {
        let component: ReactRenderer<MentionSuggestionListRef> | null = null
        let popup: TippyInstance[] | null = null

        return {
          onStart: (props) => {
            component = new ReactRenderer(MentionSuggestionList, {
              props: { ...props, activeCanvasId: activeCanvasIdRef.current },
              editor: props.editor,
            })

            if (!props.clientRect) return

            popup = tippy('body', {
              getReferenceClientRect: props.clientRect as () => DOMRect,
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: 'manual',
              placement: 'top-start',
              offset: [0, 8],
            })
          },

          onUpdate: (props) => {
            component?.updateProps({ ...props, activeCanvasId: activeCanvasIdRef.current })

            if (!props.clientRect || !popup?.[0]) return

            popup[0].setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            })
          },

          onKeyDown: (props) => {
            if (props.event.key === 'Escape') {
              popup?.[0]?.hide()
              return true
            }
            return component?.ref?.onKeyDown(props) ?? false
          },

          onExit: () => {
            popup?.[0]?.destroy()
            component?.destroy()
            popup = null
            component = null
          },
        }
      },
    },
  })
}
