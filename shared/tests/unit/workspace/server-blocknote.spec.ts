import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createServerBlockNoteEditor } from '../../../src/workspace/server-blocknote.js'
import {
  convertWorkspaceInterlinksToLinksInBlocks,
  convertWorkspaceLinksToInterlinksInBlocks,
} from '../../../src/workspace/workspace-interlink.js'

describe('server blocknote schema', () => {
  it('supports markdown link round-trip with workspace interlink conversions', async () => {
    const editor = createServerBlockNoteEditor()

    const inputMarkdown = 'See [Plan](/workspace/Planning/Plan.md?view=1#today)'
    const parsedBlocks = await editor.tryParseMarkdownToBlocks(inputMarkdown)
    const interlinkedBlocks = convertWorkspaceLinksToInterlinksInBlocks(parsedBlocks)
    const detachedFragment = editor.blocksToYXmlFragment(
      interlinkedBlocks as Parameters<typeof editor.blocksToYXmlFragment>[0]
    )

    const yDoc = new Y.Doc()
    const editors = yDoc.getMap('editors')
    editors.set('test', detachedFragment)
    const attachedFragment = editors.get('test') as Y.XmlFragment

    const blocksFromFragment = editor.yXmlFragmentToBlocks(attachedFragment)
    const markdownBlocks = convertWorkspaceInterlinksToLinksInBlocks(blocksFromFragment)
    const markdown = await editor.blocksToMarkdownLossy(
      markdownBlocks as Parameters<typeof editor.blocksToMarkdownLossy>[0]
    )

    expect(markdown).toContain(inputMarkdown)
  })
})
