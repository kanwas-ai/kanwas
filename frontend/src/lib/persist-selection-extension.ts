import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'

export const persistSelectionKey = new PluginKey('persistSelection')

/**
 * TipTap extension that keeps selection visually highlighted even when editor loses focus.
 * Similar to VS Code behavior where text stays highlighted when you click elsewhere.
 */
export const PersistSelectionExtension = Extension.create({
  name: 'persistSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: persistSelectionKey,
        state: {
          init() {
            return { from: 0, to: 0, hasFocus: true }
          },
          apply(tr, value) {
            // Track selection and focus state
            const meta = tr.getMeta(persistSelectionKey)
            if (meta) {
              return { ...value, ...meta }
            }
            // Update selection range when selection changes
            const { from, to } = tr.selection
            return { ...value, from, to }
          },
        },
        props: {
          decorations(state) {
            const pluginState = persistSelectionKey.getState(state)
            if (!pluginState) return DecorationSet.empty

            // Only show decorations when NOT focused and there's a real selection
            if (pluginState.hasFocus || pluginState.from === pluginState.to) {
              return DecorationSet.empty
            }

            // Create highlight decoration for the stored selection
            const decoration = Decoration.inline(pluginState.from, pluginState.to, {
              class: 'persist-selection-highlight',
            })

            return DecorationSet.create(state.doc, [decoration])
          },
        },
        view(view: EditorView) {
          const dom = view.dom

          const handleMouseDown = (event: MouseEvent) => {
            const pluginState = persistSelectionKey.getState(view.state)
            if (!pluginState || pluginState.hasFocus) return

            // Check if click is within the persisted selection
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (pos && pos.pos >= pluginState.from && pos.pos <= pluginState.to) {
              // Click is within persisted selection - restore it as active selection
              event.preventDefault()
              view.dispatch(
                view.state.tr
                  .setSelection(TextSelection.create(view.state.doc, pluginState.from, pluginState.to))
                  .setMeta(persistSelectionKey, { hasFocus: true, from: 0, to: 0 })
                  .setMeta('addToHistory', false)
              )
              view.focus()
            } else {
              // Click is outside - clear the persisted selection
              view.dispatch(
                view.state.tr
                  .setMeta(persistSelectionKey, { hasFocus: true, from: 0, to: 0 })
                  .setMeta('addToHistory', false)
              )
            }
          }

          const handleFocus = () => {
            view.dispatch(view.state.tr.setMeta(persistSelectionKey, { hasFocus: true }).setMeta('addToHistory', false))
          }

          const handleBlur = () => {
            // Store current selection before blur clears it
            const { from, to } = view.state.selection
            view.dispatch(
              view.state.tr.setMeta(persistSelectionKey, { hasFocus: false, from, to }).setMeta('addToHistory', false)
            )
          }

          dom.addEventListener('mousedown', handleMouseDown)
          dom.addEventListener('focus', handleFocus)
          dom.addEventListener('blur', handleBlur)

          return {
            destroy() {
              dom.removeEventListener('mousedown', handleMouseDown)
              dom.removeEventListener('focus', handleFocus)
              dom.removeEventListener('blur', handleBlur)
            },
          }
        },
      }),
    ]
  },
})
