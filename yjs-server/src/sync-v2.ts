import * as decoding from 'lib0/decoding.js'
import * as encoding from 'lib0/encoding.js'
import * as Y from 'yjs'

export const messageYjsSyncStep1 = 0
export const messageYjsSyncStep2 = 1
export const messageYjsUpdate = 2

export function writeSyncStep1(encoder: encoding.Encoder, doc: Y.Doc): void {
  encoding.writeVarUint(encoder, messageYjsSyncStep1)
  encoding.writeVarUint8Array(encoder, Y.encodeStateVector(doc))
}

export function writeSyncStep2(encoder: encoding.Encoder, doc: Y.Doc, encodedStateVector?: Uint8Array): void {
  encoding.writeVarUint(encoder, messageYjsSyncStep2)
  encoding.writeVarUint8Array(encoder, Y.encodeStateAsUpdateV2(doc, encodedStateVector))
}

export function readSyncStep1(decoder: decoding.Decoder, encoder: encoding.Encoder, doc: Y.Doc): void {
  writeSyncStep2(encoder, doc, decoding.readVarUint8Array(decoder))
}

export function readSyncStep2(
  decoder: decoding.Decoder,
  doc: Y.Doc,
  transactionOrigin: unknown,
  errorHandler?: (error: Error) => void
): void {
  try {
    Y.applyUpdateV2(doc, decoding.readVarUint8Array(decoder), transactionOrigin)
  } catch (error) {
    if (errorHandler) {
      errorHandler(error as Error)
      return
    }

    throw error
  }
}

export function writeUpdate(encoder: encoding.Encoder, update: Uint8Array): void {
  encoding.writeVarUint(encoder, messageYjsUpdate)
  encoding.writeVarUint8Array(encoder, update)
}

export function readUpdate(
  decoder: decoding.Decoder,
  doc: Y.Doc,
  transactionOrigin: unknown,
  errorHandler?: (error: Error) => void
): void {
  readSyncStep2(decoder, doc, transactionOrigin, errorHandler)
}

export function readSyncMessage(
  decoder: decoding.Decoder,
  encoder: encoding.Encoder,
  doc: Y.Doc,
  transactionOrigin: unknown,
  errorHandler?: (error: Error) => void
): number {
  const messageType = decoding.readVarUint(decoder)

  switch (messageType) {
    case messageYjsSyncStep1:
      readSyncStep1(decoder, encoder, doc)
      break
    case messageYjsSyncStep2:
      readSyncStep2(decoder, doc, transactionOrigin, errorHandler)
      break
    case messageYjsUpdate:
      readUpdate(decoder, doc, transactionOrigin, errorHandler)
      break
    default:
      throw new Error('Unknown message type')
  }

  return messageType
}
