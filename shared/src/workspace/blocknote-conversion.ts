import * as Y from 'yjs'
import {
  convertWorkspaceInterlinksToLinksInBlocks,
  convertWorkspaceLinksToInterlinksInBlocks,
} from './workspace-interlink.js'
import { normalizeBlockNoteMarkdown } from './markdown-normalization.js'
import type { createServerBlockNoteEditor } from './server-blocknote.js'

type ServerBlockNoteEditor = ReturnType<typeof createServerBlockNoteEditor>
type ParsedBlocks = Awaited<ReturnType<ServerBlockNoteEditor['tryParseMarkdownToBlocks']>>
type FragmentBlocks = ReturnType<ServerBlockNoteEditor['yXmlFragmentToBlocks']>

export async function markdownToInterlinkedBlocks(
  editor: ServerBlockNoteEditor,
  markdown: string
): Promise<ParsedBlocks> {
  const parsedBlocks = await editor.tryParseMarkdownToBlocks(normalizeMarkdownForBlockNoteImport(markdown))
  return convertWorkspaceLinksToInterlinksInBlocks(parsedBlocks) as ParsedBlocks
}

export function blocksToFragment(
  editor: ServerBlockNoteEditor,
  blocks: ParsedBlocks,
  targetFragment?: Y.XmlFragment
): Y.XmlFragment {
  return (
    editor.blocksToYXmlFragment as (
      blocks: Parameters<ServerBlockNoteEditor['blocksToYXmlFragment']>[0],
      fragment?: Y.XmlFragment
    ) => Y.XmlFragment
  ).call(editor, blocks as Parameters<ServerBlockNoteEditor['blocksToYXmlFragment']>[0], targetFragment)
}

export async function blocksToWorkspaceMarkdown(
  editor: ServerBlockNoteEditor,
  blocks: FragmentBlocks
): Promise<string> {
  const markdownBlocks = convertWorkspaceInterlinksToLinksInBlocks(blocks)
  const markdown = await editor.blocksToMarkdownLossy(
    markdownBlocks as Parameters<ServerBlockNoteEditor['blocksToMarkdownLossy']>[0]
  )

  return normalizeBlockNoteMarkdown(markdown)
}

export async function fragmentToWorkspaceMarkdown(
  editor: ServerBlockNoteEditor,
  fragment: Y.XmlFragment
): Promise<string> {
  const blocks = editor.yXmlFragmentToBlocks(fragment)
  return await blocksToWorkspaceMarkdown(editor, blocks)
}

function normalizeMarkdownForBlockNoteImport(markdown: string): string {
  return markdown.replace(/\r\n?/g, '\n').replace(/\n+$/g, '')
}
