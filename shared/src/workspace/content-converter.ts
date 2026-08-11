import * as Y from 'yjs'
import { type Logger, noopLogger } from '../logging/types.js'
import { blocksToFragment, fragmentToWorkspaceMarkdown, markdownToInterlinkedBlocks } from './blocknote-conversion.js'
import { createServerBlockNoteEditor } from './server-blocknote.js'
import { findNoteBlockNoteFragment, getNoteDocMeta } from './note-doc.js'

export type StrictUpdateFailureType =
  | 'detached_fragment'
  | 'registered_content_mismatch'
  | 'parse_failed'
  | 'apply_failed'
  | 'identity_contract_violated'

export interface FragmentUpdateContext {
  nodeId: string
  source: string
}

export class StrictFragmentUpdateError extends Error {
  readonly nodeId: string
  readonly failureType: StrictUpdateFailureType
  readonly sourceContext: string
  readonly converterSource = 'ContentConverter.updateFragmentFromMarkdown'

  constructor(options: {
    nodeId: string
    failureType: StrictUpdateFailureType
    sourceContext: string
    message: string
    cause?: unknown
  }) {
    super(
      `${options.message} [nodeId=${options.nodeId} failureType=${options.failureType} source=${options.sourceContext}]`,
      options.cause === undefined ? undefined : { cause: options.cause }
    )
    this.name = 'StrictFragmentUpdateError'
    this.nodeId = options.nodeId
    this.failureType = options.failureType
    this.sourceContext = options.sourceContext
  }
}

/**
 * ContentConverter handles bidirectional conversion between Markdown and BlockNote Y.XmlFragment.
 *
 * This is used by the filesystem syncer to:
 * - Convert markdown files to BlockNote content when syncing FS → Yjs
 * - Convert BlockNote content to markdown when reading (already done in converter.ts)
 *
 * IMPORTANT: BlockNote's blocksToYXmlFragment() creates a DETACHED fragment (doc=null).
 * The fragment must be set to a Y.Map/Y.Array in a Y.Doc before it can be read back.
 * Once set, Yjs "adopts" the fragment and its children into the target doc.
 */
export class ContentConverter {
  private editor: ReturnType<typeof createServerBlockNoteEditor>
  private log: Logger

  constructor(logger?: Logger) {
    this.editor = createServerBlockNoteEditor()
    this.log = logger?.child({ component: 'ContentConverter' }) ?? noopLogger
  }

  /**
   * Create a new Y.XmlFragment from markdown content.
   *
   * IMPORTANT: The returned fragment is DETACHED (doc=null). You MUST set it to a
   * shared Yjs type in a Y.Doc before you can read its contents. Example:
   *
   *   const fragment = await converter.createFragmentFromMarkdown(markdown)
   *   contentStore.setBlockNoteFragment(nodeId, fragment)
   *   const attached = contentStore.getBlockNoteFragment(nodeId)
   *   // Now you can read: attached?.toArray(), fragmentToMarkdown(attached), etc.
   */
  async createFragmentFromMarkdown(markdown: string): Promise<Y.XmlFragment> {
    const startTime = Date.now()
    this.log.debug({ markdownLength: markdown.length }, 'Creating fragment from markdown')

    const interlinkedBlocks = await markdownToInterlinkedBlocks(this.editor, markdown)
    const fragment = blocksToFragment(this.editor, interlinkedBlocks)

    this.log.debug(
      { markdownLength: markdown.length, durationMs: Date.now() - startTime },
      'Fragment created from markdown'
    )
    return fragment
  }

  /**
   * Patch an existing registered BlockNote fragment in place from markdown content.
   */
  async updateFragmentFromMarkdown(
    fragment: Y.XmlFragment,
    markdown: string,
    context: FragmentUpdateContext
  ): Promise<void> {
    const startTime = Date.now()
    const { nodeId, source } = context

    const strictError = (failureType: StrictUpdateFailureType, message: string, cause?: unknown) =>
      new StrictFragmentUpdateError({
        nodeId,
        failureType,
        sourceContext: source,
        message,
        cause,
      })

    const doc = fragment.doc
    if (!doc) {
      throw strictError('detached_fragment', 'Cannot update a detached fragment. The fragment must be part of a Y.Doc.')
    }

    const isRegisteredFragment = this.isRegisteredBlockNoteFragment(doc, nodeId, fragment)
    if (!isRegisteredFragment) {
      throw strictError('registered_content_mismatch', 'Update target does not match registered BlockNote content')
    }

    const initialLength = fragment.length
    this.log.debug(
      { nodeId, source, markdownLength: markdown.length, fragmentLength: initialLength },
      'Updating fragment from markdown'
    )

    let interlinkedBlocks: Awaited<ReturnType<typeof markdownToInterlinkedBlocks>>
    try {
      interlinkedBlocks = await markdownToInterlinkedBlocks(this.editor, markdown)
    } catch (error) {
      throw strictError('parse_failed', 'Failed to parse markdown before fragment update', error)
    }

    if (!this.isRegisteredBlockNoteFragment(doc, nodeId, fragment)) {
      throw strictError(
        'registered_content_mismatch',
        'Update target no longer matches registered BlockNote content before apply'
      )
    }

    let updatedFragment: Y.XmlFragment | undefined
    try {
      doc.transact(() => {
        updatedFragment = blocksToFragment(this.editor, interlinkedBlocks, fragment)
      }, 'content-converter:update-fragment')
    } catch (error) {
      throw strictError('apply_failed', 'Failed while applying in-place fragment update', error)
    }

    if (updatedFragment !== fragment) {
      throw strictError(
        'identity_contract_violated',
        'In-place update contract violated: conversion returned a different fragment instance'
      )
    }

    this.log.debug(
      {
        nodeId,
        source,
        fragmentLength: fragment.length,
        durationMs: Date.now() - startTime,
      },
      'Fragment updated in place'
    )
  }

  private isRegisteredBlockNoteFragment(doc: Y.Doc, nodeId: string, fragment: Y.XmlFragment): boolean {
    const noteMeta = getNoteDocMeta(doc)
    if (!noteMeta || noteMeta.noteId !== nodeId) {
      return false
    }

    return findNoteBlockNoteFragment(doc) === fragment
  }

  /**
   * Convert Y.XmlFragment to markdown string
   * Use this when reading node content (for comparison or display)
   */
  async fragmentToMarkdown(fragment: Y.XmlFragment): Promise<string> {
    const startTime = Date.now()
    this.log.debug({ fragmentLength: fragment.length }, 'Converting fragment to markdown')

    const markdown = await fragmentToWorkspaceMarkdown(this.editor, fragment)

    this.log.debug(
      { fragmentLength: fragment.length, markdownLength: markdown.length, durationMs: Date.now() - startTime },
      'Fragment converted to markdown'
    )
    return markdown
  }
}
