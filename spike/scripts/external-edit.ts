// Exit criterion (b), the write half: edit a .md on disk, then push the change
// into the LIVE workspace yDoc the way execenv would — connect to the yjs-server
// room as a non-frontend client and drive FilesystemSyncer.syncChange for the
// edited file. This exercises the fragment-replacement remount path in the
// browser (the open note reloads).
//
// Usage: tsx external-edit.ts <relPath> <markerToken>
// Run from spike/ (ESM, tsx).
import fsp from 'node:fs/promises'
import path from 'node:path'
import * as Y from 'yjs'
import WebSocket from 'ws'
import { FilesystemSyncer, ContentConverter } from '../../shared/dist/server.js'
import { connectToWorkspace } from '../../shared/dist/index.js'
import { PathMapper } from '../../shared/dist/workspace/path-mapper.js'
import { WORKSPACE_ID, YJS_HOST, TEST_FOLDER, mintSocketToken } from '../spike.config.mjs'

const relPath = process.argv[2] || 'expedition-notes.md'
const marker = process.argv[3] || `EXTERNALEDIT${Date.now()}`

async function main() {
  const abs = path.join(TEST_FOLDER, relPath)

  // 1) Mutate the file on disk exactly like an external editor / CLI agent would.
  //    Strip any prior marker section so re-runs replace instead of accumulate.
  const original = await fsp.readFile(abs, 'utf-8')
  const base = original.split('\n\n## External edit\n')[0]
  const edited = `${base.trimEnd()}\n\n## External edit\n\nMarker: ${marker}\n`
  await fsp.writeFile(abs, edited, 'utf-8')
  console.log(`[edit] wrote marker ${marker} into ${relPath} on disk`)

  // 2) Connect to the live room as a non-frontend client with a locally-minted
  //    socket token (same HMAC scheme the frontend/backend use).
  const { token } = mintSocketToken(WORKSPACE_ID)
  const connection = await connectToWorkspace({
    host: YJS_HOST,
    workspaceId: WORKSPACE_ID,
    clientKind: 'execenv',
    protocol: 'ws',
    WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
    socketToken: token,
    timeout: 20000,
  })
  console.log('[edit] connected + synced (root + all note subdocs ready)')

  try {
    // 3) Drive FilesystemSyncer over the live connection.
    const pathMapper = new PathMapper()
    pathMapper.buildFromWorkspace(connection.proxy)
    const syncer = new FilesystemSyncer({
      proxy: connection.proxy,
      yDoc: connection.yDoc,
      pathMapper,
      contentConverter: new ContentConverter(),
      fileUploader: async (buf: Buffer, _c: string, name: string, mime: string) => ({
        storagePath: relPath,
        mimeType: mime,
        size: buf.length,
      }),
      fileReader: async (rel: string) => fsp.readFile(path.join(TEST_FOLDER, rel)),
      autoCreateCanvases: true,
    })

    const res = await syncer.syncChange({ type: 'update', path: relPath, content: edited })
    console.log('[edit] syncChange result:', JSON.stringify(res))
    if (!('success' in res) || !res.success) {
      throw new Error(`syncChange failed: ${'error' in res ? res.error : 'unknown'}`)
    }

    // 4) Give the update time to broadcast to the frontend and the room to save.
    await new Promise((r) => setTimeout(r, 2000))
    console.log('[edit] update broadcast; done')
  } finally {
    connection.disconnect()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[edit] fatal:', err)
    process.exit(1)
  })
