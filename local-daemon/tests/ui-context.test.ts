import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  emptyEnrichedContext,
  enrichContext,
  parseUiContextInput,
  resolveRef,
  resolveTextLines,
  UiContextStore,
  type UiContextMount,
} from '../src/terminal/ui-context.js'

const tmpDirs: string[] = []
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function tmpFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwasd-ui-context-'))
  tmpDirs.push(dir)
  return dir
}

/** A minimal fake mount — see UiContextMount's doc comment for why this is a plain object, not a real Mount. */
function fakeMount(folder: string, nodePaths: Record<string, string>): UiContextMount {
  return {
    folder,
    orchestrator: { resolveNodePath: (nodeId: string) => nodePaths[nodeId] },
  }
}

describe('resolveTextLines', () => {
  const fileContent = [
    '# Title',
    '',
    'First paragraph line one.',
    'First paragraph line two.',
    '',
    'Second paragraph.',
  ].join('\n')

  it('finds an exact match', () => {
    expect(resolveTextLines(fileContent, 'Second paragraph.')).toEqual({ startLine: 6, endLine: 6 })
  })

  it('finds a match spanning multiple lines', () => {
    expect(resolveTextLines(fileContent, 'First paragraph line one.\nFirst paragraph line two.')).toEqual({
      startLine: 3,
      endLine: 4,
    })
  })

  it('matches with normalized whitespace (extra spaces / different line breaks in the search text)', () => {
    expect(resolveTextLines(fileContent, '  First   paragraph line one.   First paragraph line two.  ')).toEqual({
      startLine: 3,
      endLine: 4,
    })
  })

  it('uses the FIRST occurrence when the text appears multiple times', () => {
    const repeated = ['dup', 'other', 'dup'].join('\n')
    expect(resolveTextLines(repeated, 'dup')).toEqual({ startLine: 1, endLine: 1 })
  })

  it('returns undefined when the text is not found', () => {
    expect(resolveTextLines(fileContent, 'nonexistent text')).toBeUndefined()
  })

  it('returns undefined for empty/whitespace-only search text', () => {
    expect(resolveTextLines(fileContent, '   ')).toBeUndefined()
    expect(resolveTextLines(fileContent, '')).toBeUndefined()
  })
})

describe('UiContextStore', () => {
  it('roundtrips set/get and stamps an updatedAt', () => {
    const store = new UiContextStore()
    expect(store.get('ws-a')).toBeUndefined()

    const input = { activeCanvasId: 'root', selectedNodeIds: ['n1'], openDocument: null, textSelection: null }
    store.set('ws-a', input)

    const entry = store.get('ws-a')
    expect(entry?.input).toEqual(input)
    expect(typeof entry?.updatedAt).toBe('string')
  })

  it('mostRecent returns the workspace updated last', async () => {
    const store = new UiContextStore()
    const empty = { activeCanvasId: null, selectedNodeIds: [], openDocument: null, textSelection: null }
    store.set('ws-a', empty)
    await new Promise((r) => setTimeout(r, 5))
    store.set('ws-b', empty)

    expect(store.mostRecent()?.workspaceId).toBe('ws-b')
  })

  it('mostRecent is undefined when nothing has been reported', () => {
    expect(new UiContextStore().mostRecent()).toBeUndefined()
  })
})

describe('parseUiContextInput', () => {
  it('parses a well-formed body', () => {
    const body = {
      activeCanvasId: 'root',
      selectedNodeIds: ['a', 'b'],
      openDocument: { nodeId: 'a' },
      textSelection: { nodeId: 'a', text: 'hello' },
    }
    expect(parseUiContextInput(body)).toEqual(body)
  })

  it('falls back to empty defaults for malformed/missing fields', () => {
    expect(parseUiContextInput({})).toEqual({
      activeCanvasId: null,
      selectedNodeIds: [],
      openDocument: null,
      textSelection: null,
    })
    expect(parseUiContextInput(null)).toEqual({
      activeCanvasId: null,
      selectedNodeIds: [],
      openDocument: null,
      textSelection: null,
    })
    expect(
      parseUiContextInput({ selectedNodeIds: ['ok', 42, null], openDocument: { nodeId: 5 }, textSelection: 'nope' })
    ).toEqual({
      activeCanvasId: null,
      selectedNodeIds: ['ok'],
      openDocument: null,
      textSelection: null,
    })
  })
})

describe('resolveRef', () => {
  it('resolves a node id to its path, with no text', () => {
    const folder = tmpFolder()
    const mount = fakeMount(folder, { n1: 'notes/readme.md' })
    expect(resolveRef(mount, 'n1')).toEqual({ path: 'notes/readme.md' })
  })

  it('returns undefined for a node id with no on-disk mapping', () => {
    const mount = fakeMount(tmpFolder(), {})
    expect(resolveRef(mount, 'unknown')).toBeUndefined()
  })

  it('resolves text to a line range when the file exists and contains it', () => {
    const folder = tmpFolder()
    fs.mkdirSync(path.join(folder, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(folder, 'notes/readme.md'), 'line one\nline two\nline three\n', 'utf-8')
    const mount = fakeMount(folder, { n1: 'notes/readme.md' })

    expect(resolveRef(mount, 'n1', 'line two')).toEqual({ path: 'notes/readme.md', startLine: 2, endLine: 2 })
  })

  it('resolves to just the path when the text is not found or the file is missing', () => {
    const folder = tmpFolder()
    fs.mkdirSync(path.join(folder, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(folder, 'notes/readme.md'), 'line one\n', 'utf-8')
    const mount = fakeMount(folder, { n1: 'notes/readme.md', n2: 'notes/missing.md' })

    expect(resolveRef(mount, 'n1', 'nope')).toEqual({ path: 'notes/readme.md' })
    expect(resolveRef(mount, 'n2', 'anything')).toEqual({ path: 'notes/missing.md' })
  })
})

describe('enrichContext', () => {
  it('resolves selected nodes, open document, and text selection together', () => {
    const folder = tmpFolder()
    fs.mkdirSync(path.join(folder, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(folder, 'notes/a.md'), 'alpha\nbeta\ngamma\n', 'utf-8')
    const mount = fakeMount(folder, { a: 'notes/a.md', b: 'notes/b.md' })

    const enriched = enrichContext(
      mount,
      {
        activeCanvasId: 'root',
        selectedNodeIds: ['a', 'b', 'unknown'],
        openDocument: { nodeId: 'a' },
        textSelection: { nodeId: 'a', text: 'beta' },
      },
      '2026-07-19T00:00:00.000Z'
    )

    expect(enriched.activeCanvasId).toBe('root')
    expect(enriched.selectedNodeIds).toEqual(['a', 'b', 'unknown'])
    expect(enriched.selectedPaths).toEqual(['notes/a.md', 'notes/b.md']) // unresolvable id dropped
    expect(enriched.openDocument).toEqual({ nodeId: 'a', path: 'notes/a.md' })
    expect(enriched.textSelection).toEqual({ nodeId: 'a', text: 'beta', path: 'notes/a.md', startLine: 2, endLine: 2 })
    expect(enriched.updatedAt).toBe('2026-07-19T00:00:00.000Z')
  })

  it('handles an unresolvable openDocument/textSelection node id gracefully', () => {
    const mount = fakeMount(tmpFolder(), {})
    const enriched = enrichContext(
      mount,
      {
        activeCanvasId: null,
        selectedNodeIds: [],
        openDocument: { nodeId: 'ghost' },
        textSelection: { nodeId: 'ghost', text: 'x' },
      },
      '2026-07-19T00:00:00.000Z'
    )
    expect(enriched.openDocument).toEqual({ nodeId: 'ghost', path: null })
    expect(enriched.textSelection).toEqual({ nodeId: 'ghost', text: 'x', path: null })
  })
})

describe('emptyEnrichedContext', () => {
  it('is the shape returned before anything has been reported', () => {
    expect(emptyEnrichedContext()).toEqual({
      activeCanvasId: null,
      selectedNodeIds: [],
      selectedPaths: [],
      openDocument: null,
      textSelection: null,
      updatedAt: null,
    })
  })
})
