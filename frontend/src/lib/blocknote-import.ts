import { BlockNoteEditor } from '@blocknote/core'
import { convertWorkspaceLinksToInterlinksInBlocks } from 'shared/workspace-interlink'
import { blockNoteSchema } from '@/lib/blocknote-schema'

type ImportedContentParser = {
  pmSchema: BlockNoteEditor['pmSchema']
  blocksToFullHTML: BlockNoteEditor<
    typeof blockNoteSchema.blockSchema,
    typeof blockNoteSchema.inlineContentSchema,
    typeof blockNoteSchema.styleSchema
  >['blocksToFullHTML']
  tryParseHTMLToBlocks: BlockNoteEditor<
    typeof blockNoteSchema.blockSchema,
    typeof blockNoteSchema.inlineContentSchema,
    typeof blockNoteSchema.styleSchema
  >['tryParseHTMLToBlocks']
  tryParseMarkdownToBlocks: BlockNoteEditor<
    typeof blockNoteSchema.blockSchema,
    typeof blockNoteSchema.inlineContentSchema,
    typeof blockNoteSchema.styleSchema
  >['tryParseMarkdownToBlocks']
}

export type ImportedBlocks = ReturnType<ImportedContentParser['tryParseMarkdownToBlocks']>
type ImportedBlock = ImportedBlocks[number]
export type ImportedBlocksParseResult = { ok: true; blocks: ImportedBlocks } | { ok: false; error: Error }

let importedContentParser: ImportedContentParser | null = null

export function getImportedContentParser() {
  if (!importedContentParser) {
    importedContentParser = BlockNoteEditor.create({ schema: blockNoteSchema })
  }

  return importedContentParser
}

function createParagraphBlock(text: string): ImportedBlock {
  return {
    id: crypto.randomUUID(),
    type: 'paragraph',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
    content: text ? [{ type: 'text', text, styles: {} }] : [],
    children: [],
  } as ImportedBlock
}

export function parseImportedContentToBlocks(content: string, format: 'text' | 'markdown' | 'html'): ImportedBlocks {
  const parser = getImportedContentParser()

  if (format === 'html') {
    return convertWorkspaceLinksToInterlinksInBlocks(parser.tryParseHTMLToBlocks(content)) as ImportedBlocks
  }

  if (format === 'markdown') {
    return convertWorkspaceLinksToInterlinksInBlocks(parser.tryParseMarkdownToBlocks(content)) as ImportedBlocks
  }

  const normalizedText = content.replace(/\r\n?/g, '\n')
  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return [createParagraphBlock('')]
  }

  return paragraphs.map((paragraph) => createParagraphBlock(paragraph))
}

function normalizeImportError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage)
}

export function parseBlockNoteClipboardHtmlToBlocks(html: string): ImportedBlocksParseResult {
  if (!html.trim()) {
    return { ok: false, error: new Error('BlockNote clipboard HTML is empty') }
  }

  try {
    const blocks = parseImportedContentToBlocks(html, 'html')
    if (blocks.length === 0) {
      return { ok: false, error: new Error('BlockNote clipboard HTML produced no blocks') }
    }

    return { ok: true, blocks }
  } catch (error) {
    return { ok: false, error: normalizeImportError(error, 'Could not parse BlockNote clipboard HTML') }
  }
}

export function importedBlocksToFullHtml(blocks: ImportedBlocks): string {
  return getImportedContentParser().blocksToFullHTML(blocks)
}
