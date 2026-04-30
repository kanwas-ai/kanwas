import { blockToNode } from '@blocknote/core'
import type { Block, BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core'
import type { Schema } from 'prosemirror-model'
import { prosemirrorToYXmlFragment } from 'y-prosemirror'
import type * as Y from 'yjs'

/**
 * Convert BlockNote blocks to ProseMirror node
 * (Simplified version of ServerBlockNoteEditor._blocksToProsemirrorNode)
 */
function blocksToProsemirrorNode<
  BSchema extends BlockSchema,
  ISchema extends InlineContentSchema,
  SSchema extends StyleSchema,
>(blocks: Block<BSchema, ISchema, SSchema>[], pmSchema: Schema) {
  const pmNodes = blocks.map((b) => blockToNode(b, pmSchema))

  const doc = pmSchema.topNodeType.create(null, pmSchema.nodes['blockGroup'].create(null, pmNodes))
  return doc
}

/**
 * Convert blocks to a Y.XmlFragment
 * (Simplified version of ServerBlockNoteEditor.blocksToYXmlFragment)
 *
 * This can be used when importing existing content to Y.Doc for the first time,
 * note that this should not be used to rehydrate a Y.Doc from a database once
 * collaboration has begun as all history will be lost
 *
 * @param blocks the blocks to convert
 * @param pmSchema the ProseMirror schema from the editor
 * @param xmlFragment optional existing fragment to populate
 * @returns Y.XmlFragment
 */
export function blocksToYXmlFragment<
  BSchema extends BlockSchema,
  ISchema extends InlineContentSchema,
  SSchema extends StyleSchema,
>(blocks: Block<BSchema, ISchema, SSchema>[], pmSchema: Schema, xmlFragment?: Y.XmlFragment): Y.XmlFragment {
  return prosemirrorToYXmlFragment(blocksToProsemirrorNode(blocks, pmSchema), xmlFragment)
}
