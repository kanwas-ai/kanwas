import { describe, expect, it } from 'vitest'
import { gunzipSync, gzipSync } from 'fflate'
import * as Y from 'yjs'
import { decodeBootstrapPayload, encodeBootstrapPayload } from '../../../src/workspace/bootstrap-codec.js'
import { createNoteDoc } from '../../../src/workspace/note-doc.js'
import type { WorkspaceBootstrapPayload } from '../../../src/workspace/workspace-sync-types.js'

function createPayload(): WorkspaceBootstrapPayload {
  const rootDoc = new Y.Doc()
  const noteDoc = createNoteDoc('note-1', 'blockNote')

  rootDoc.getMap('state').set('root', { id: 'root', kind: 'canvas' })
  rootDoc.getMap<Y.Doc>('notes').set('note-1', noteDoc)

  const fragment = noteDoc.getXmlFragment('content')
  const paragraph = new Y.XmlElement('paragraph')
  const textNode = new Y.XmlText()
  textNode.insert(0, 'hello packed bootstrap')
  paragraph.insert(0, [textNode])
  fragment.insert(0, [paragraph])

  return {
    docs: [
      {
        docId: 'root',
        generation: 1,
        kind: 'root',
        update: Y.encodeStateAsUpdateV2(rootDoc),
      },
      {
        docId: 'note-1',
        generation: 2,
        kind: 'note',
        noteKind: 'blockNote',
        update: Y.encodeStateAsUpdateV2(noteDoc),
      },
    ],
  }
}

describe('bootstrap-codec', () => {
  it('round-trips packed bootstrap payloads', () => {
    const payload = createPayload()

    expect(decodeBootstrapPayload(encodeBootstrapPayload(payload))).toEqual(payload)
  })

  it('gzip-compresses packed bootstrap payloads', () => {
    const encoded = encodeBootstrapPayload(createPayload())

    expect(Array.from(encoded.slice(0, 2))).toEqual([0x1f, 0x8b])
    expect(gunzipSync(encoded)[0]).toBe(1)
  })

  it('rejects unsupported codec versions', () => {
    const raw = gunzipSync(encodeBootstrapPayload(createPayload()))
    raw[0] = 2

    expect(() => decodeBootstrapPayload(gzipSync(raw))).toThrow('Unsupported bootstrap payload version 2')
  })
})
