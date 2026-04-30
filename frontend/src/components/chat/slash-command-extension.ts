import { type Editor, Extension, type Range } from '@tiptap/core'
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import type { SlashCommand, CommandContext } from './commands'
import { SlashCommandSuggestionList, type SlashCommandSuggestionListRef } from './SlashCommandSuggestionList'
import type { MutableRefObject } from 'react'

export function createSlashCommandExtension(
  commandsRef: MutableRefObject<SlashCommand[]>,
  contextRef: MutableRefObject<CommandContext>
) {
  return Extension.create({
    name: 'slashCommands',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          startOfLine: false,
          items: ({ query }: { query: string }) => {
            const commands = commandsRef.current
            const lowerQuery = query.toLowerCase()
            return lowerQuery ? commands.filter((cmd) => cmd.name.toLowerCase().includes(lowerQuery)) : commands
          },
          command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashCommand }) => {
            if (props.immediate && props.handler) {
              // Immediate commands: delete text and execute handler
              editor.chain().focus().deleteRange(range).run()
              props.handler(contextRef.current)
            } else if (props.insertText) {
              // Non-immediate commands (skills): replace with insertText for user to edit/submit
              editor.chain().focus().deleteRange(range).insertContent(props.insertText).run()
            } else {
              // Fallback: insert command name
              editor.chain().focus().deleteRange(range).insertContent(`/${props.name} `).run()
            }
          },
          render: () => {
            let component: ReactRenderer<SlashCommandSuggestionListRef> | null = null
            let popup: TippyInstance[] | null = null

            return {
              onStart: (props: SuggestionProps<SlashCommand>) => {
                component = new ReactRenderer(SlashCommandSuggestionList, {
                  props,
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

              onUpdate: (props: SuggestionProps<SlashCommand>) => {
                component?.updateProps(props)

                if (!props.clientRect || !popup?.[0]) return

                popup[0].setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                })
              },

              onKeyDown: (props: SuggestionKeyDownProps) => {
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
        } satisfies Partial<SuggestionOptions<SlashCommand>>,
      }
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ]
    },
  })
}
