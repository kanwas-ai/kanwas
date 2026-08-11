import { gunzipSync, gzipSync } from 'fflate'
import * as decoding from 'lib0/decoding.js'
import * as encoding from 'lib0/encoding.js'
import { isNoteContentKind, type NoteContentKind } from './note-doc.js'
import type { WorkspaceBootstrapDoc, WorkspaceBootstrapPayload } from './workspace-sync-types.js'

export type BootstrapBinaryPayload = ArrayBuffer | Uint8Array | Buffer | number[]

const BOOTSTRAP_CODEC_VERSION = 1
const BOOTSTRAP_KIND_ROOT = 0
const BOOTSTRAP_KIND_NOTE = 1

export function encodeBootstrapPayload(payload: WorkspaceBootstrapPayload): Uint8Array {
  return gzipSync(encodeRawBootstrapPayload(payload))
}

export function decodeBootstrapPayload(payload: BootstrapBinaryPayload): WorkspaceBootstrapPayload {
  return decodeRawBootstrapPayload(gunzipSync(normalizeBootstrapBinary(payload)))
}

function encodeRawBootstrapPayload(payload: WorkspaceBootstrapPayload): Uint8Array {
  const encoder = encoding.createEncoder()

  encoding.writeVarUint(encoder, BOOTSTRAP_CODEC_VERSION)
  encoding.writeVarUint(encoder, payload.docs.length)

  for (const doc of payload.docs) {
    encoding.writeVarString(encoder, doc.docId)
    encoding.writeVarUint(encoder, doc.kind === 'root' ? BOOTSTRAP_KIND_ROOT : BOOTSTRAP_KIND_NOTE)
    encoding.writeVarUint(encoder, doc.generation)

    if (doc.kind === 'note') {
      encoding.writeVarString(encoder, doc.noteKind)
    }

    encoding.writeVarUint8Array(encoder, doc.update)
  }

  return encoding.toUint8Array(encoder)
}

function decodeRawBootstrapPayload(payload: Uint8Array): WorkspaceBootstrapPayload {
  const decoder = decoding.createDecoder(payload)
  const version = decoding.readVarUint(decoder)

  if (version !== BOOTSTRAP_CODEC_VERSION) {
    throw new Error(`Unsupported bootstrap payload version ${version}`)
  }

  const docCount = decoding.readVarUint(decoder)
  const docs: WorkspaceBootstrapDoc[] = []

  for (let index = 0; index < docCount; index += 1) {
    const docId = decoding.readVarString(decoder)
    const encodedKind = decoding.readVarUint(decoder)
    const generation = decoding.readVarUint(decoder)

    if (encodedKind === BOOTSTRAP_KIND_ROOT) {
      docs.push({
        docId,
        generation,
        kind: 'root',
        update: decoding.readVarUint8Array(decoder),
      })
      continue
    }

    if (encodedKind !== BOOTSTRAP_KIND_NOTE) {
      throw new Error(`Unsupported bootstrap doc kind ${encodedKind}`)
    }

    docs.push({
      docId,
      generation,
      kind: 'note',
      noteKind: decodeNoteContentKind(decoding.readVarString(decoder)),
      update: decoding.readVarUint8Array(decoder),
    })
  }

  if (decoding.hasContent(decoder)) {
    throw new Error('Bootstrap payload contains unexpected trailing bytes')
  }

  return { docs }
}

function decodeNoteContentKind(value: string): NoteContentKind {
  if (!isNoteContentKind(value)) {
    throw new Error(`Unsupported note content kind ${value}`)
  }

  return value
}

function normalizeBootstrapBinary(payload: BootstrapBinaryPayload): Uint8Array {
  if (payload instanceof Uint8Array) {
    return payload
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload)
  }

  return Uint8Array.from(payload)
}
