import { Code } from 'lucide-react'
import type { SyntheticEvent } from 'react'
import {
  FormattingToolbarController,
  FormattingToolbar,
  BlockTypeSelect,
  blockTypeSelectItems,
  BasicTextStyleButton,
  TextAlignButton,
  ColorStyleButton,
  NestBlockButton,
  UnnestBlockButton,
  CreateLinkButton,
  type BlockTypeSelectItem,
  useCreateBlockNote,
} from '@blocknote/react'
import { SaveSnippetButton } from '@/components/canvas/nodes/SaveSnippetButton'

type BlockNoteEditorInstance = ReturnType<typeof useCreateBlockNote>

interface BlockNoteFormattingToolbarProps {
  editor: BlockNoteEditorInstance
  documentName: string
}

function stopCanvasToolbarEventPropagation(event: SyntheticEvent) {
  event.stopPropagation()
}

export function BlockNoteFormattingToolbar({ editor, documentName }: BlockNoteFormattingToolbarProps) {
  return (
    <div
      className="nodrag nopan"
      style={{ display: 'contents' }}
      onPointerDown={stopCanvasToolbarEventPropagation}
      onMouseDown={stopCanvasToolbarEventPropagation}
      onClick={stopCanvasToolbarEventPropagation}
    >
      <FormattingToolbarController
        formattingToolbar={() => (
          <FormattingToolbar>
            <BlockTypeSelect
              key="blockTypeSelect"
              items={[
                ...blockTypeSelectItems(editor.dictionary),
                {
                  name: 'Code Block',
                  type: 'codeBlock',
                  icon: Code,
                } satisfies BlockTypeSelectItem,
              ]}
            />
            <BasicTextStyleButton key="bold" basicTextStyle="bold" />
            <BasicTextStyleButton key="italic" basicTextStyle="italic" />
            <BasicTextStyleButton key="underline" basicTextStyle="underline" />
            <BasicTextStyleButton key="strike" basicTextStyle="strike" />
            <BasicTextStyleButton key="code" basicTextStyle="code" />
            <TextAlignButton key="alignLeft" textAlignment="left" />
            <TextAlignButton key="alignCenter" textAlignment="center" />
            <TextAlignButton key="alignRight" textAlignment="right" />
            <ColorStyleButton key="colors" />
            <NestBlockButton key="nest" />
            <UnnestBlockButton key="unnest" />
            <CreateLinkButton key="link" />
            <SaveSnippetButton key="saveSnippetButton" source={documentName} />
          </FormattingToolbar>
        )}
      />
    </div>
  )
}
