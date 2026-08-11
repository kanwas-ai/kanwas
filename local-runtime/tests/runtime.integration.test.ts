import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { request as httpRequest } from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startLocalRuntime, type LocalRuntimeHandle } from '../src/index.js'
import * as yaml from 'yaml'

const tmpDirs: string[] = []
let runtime: LocalRuntimeHandle | null = null

afterEach(async () => {
  await runtime?.close()
  runtime = null
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tmpDirs.push(dir)
  return dir
}

async function freePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}

async function requestStatusWithHost(origin: string, host: string): Promise<number> {
  const url = new URL('/api/workspaces', origin)
  return new Promise<number>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: { 'Host': host, 'Sec-Fetch-Site': 'same-origin' },
      },
      (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode ?? 0))
      }
    )
    request.on('error', reject)
    request.end()
  })
}

describe('embedded local runtime', () => {
  it('serves renderer, strict local APIs, Yjs tokens, and forgets without deleting files', async () => {
    const stateDir = tempDir('kanwas-runtime-state-')
    const rendererDir = tempDir('kanwas-runtime-renderer-')
    const templatesDir = tempDir('kanwas-runtime-templates-')
    const vaultDir = tempDir('kanwas-runtime-vault-')
    const legacyRegistryFile = path.join(tempDir('kanwas-runtime-legacy-'), 'vaults.json')
    fs.writeFileSync(path.join(rendererDir, 'index.html'), '<!doctype html><title>Kanwas test</title>')
    fs.writeFileSync(path.join(vaultDir, 'note.md'), '# Kept on disk\n')

    runtime = await startLocalRuntime({
      stateDir,
      rendererDir,
      templatesDir,
      legacyRegistryFile,
      logLevel: 'silent',
      port: await freePort(),
    })

    const root = await fetch(`${runtime.origin}/`, { redirect: 'manual' })
    expect(root.status).toBe(302)
    expect(root.headers.get('location')).toBe('/app')
    expect(await (await fetch(`${runtime.origin}/app`)).text()).toContain('Kanwas test')

    expect(await (await fetch(`${runtime.origin}/api/workspaces`)).json()).toEqual([])
    expect((await fetch(`${runtime.origin}/auth/me`)).status).toBe(404)
    expect((await fetch(`${runtime.origin}/api/not-a-route`)).status).toBe(404)
    expect((await fetch(`${runtime.origin}/yjs/socket.ioevil`)).status).toBe(404)
    expect((await fetch(`${runtime.origin}/api/workspaces`, { method: 'POST' })).status).toBe(405)
    expect(
      (
        await fetch(`${runtime.origin}/api/workspaces`, {
          headers: { Origin: 'https://attacker.example' },
        })
      ).status
    ).toBe(403)
    expect(await requestStatusWithHost(runtime.origin, 'evil.example:4300')).toBe(403)
    expect((await fetch(`${runtime.origin}/mcp`, { headers: { Origin: 'https://attacker.example' } })).status).toBe(403)

    const opened = await runtime.openVault(vaultDir, 'Local notes')
    const listed = (await (await fetch(`${runtime.origin}/api/workspaces`)).json()) as Array<{
      id: string
      name: string
    }>
    expect(listed).toEqual([expect.objectContaining({ id: opened.id, name: 'Local notes' })])

    const token = (await (
      await fetch(`${runtime.origin}/api/workspaces/${opened.id}/yjs-token`, { method: 'POST' })
    ).json()) as { token?: string; socketPath?: string }
    expect(token.token).toBeTruthy()
    expect(token.socketPath).toBe('/yjs/socket.io')

    const metadata = yaml.parse(fs.readFileSync(path.join(vaultDir, 'metadata.yaml'), 'utf8')) as {
      nodes: Array<{ id: string; name: string }>
    }
    const noteId = metadata.nodes.find((node) => node.name === 'note')?.id
    expect(noteId).toBeTruthy()
    const baseline = (await (
      await fetch(`${runtime.origin}/api/workspaces/${opened.id}/notes/${noteId}/content`)
    ).json()) as { hash: string | null }
    expect(baseline.hash).toBe(createHash('sha256').update('# Kept on disk\n').digest('hex'))
    fs.writeFileSync(path.join(vaultDir, 'note.md'), '# External edit wins\n')
    const conflict = await fetch(`${runtime.origin}/api/workspaces/${opened.id}/notes/${noteId}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '# UI edit\n', baseHash: baseline.hash }),
    })
    expect(conflict.status).toBe(409)
    expect(fs.readFileSync(path.join(vaultDir, 'note.md'), 'utf8')).toBe('# External edit wins\n')

    const form = new FormData()
    form.set('file', new Blob([new Uint8Array([1, 2, 3])]), 'original.png')
    form.set('canvas_id', 'root')
    form.set('filename', 'CON.png... ')
    const upload = (await (
      await fetch(`${runtime.origin}/api/workspaces/${opened.id}/files`, { method: 'POST', body: form })
    ).json()) as { storagePath: string; fileName: string }
    expect(upload).toEqual(expect.objectContaining({ storagePath: '_con.png', fileName: '_con.png' }))
    expect(fs.readFileSync(path.join(vaultDir, '_con.png'))).toEqual(Buffer.from([1, 2, 3]))
    expect(
      await (
        await fetch(
          `${runtime.origin}/api/files/raw?workspaceId=${encodeURIComponent(opened.id)}&path=${encodeURIComponent(upload.storagePath)}`
        )
      ).arrayBuffer()
    ).toEqual(Uint8Array.from([1, 2, 3]).buffer)
    const downloadResponse = await fetch(
      `${runtime.origin}/api/files/raw?workspaceId=${encodeURIComponent(opened.id)}&path=${encodeURIComponent(upload.storagePath)}&download=1&filename=CON.png`
    )
    expect(downloadResponse.headers.get('content-disposition')).toContain('attachment')
    expect(downloadResponse.headers.get('x-content-type-options')).toBe('nosniff')
    expect(downloadResponse.headers.get('content-security-policy')).toContain('sandbox')

    const outsideDir = tempDir('kanwas-runtime-outside-')
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'must not be served')
    try {
      fs.symlinkSync(outsideDir, path.join(vaultDir, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
      expect(
        (
          await fetch(
            `${runtime.origin}/api/files/raw?workspaceId=${encodeURIComponent(opened.id)}&path=escape%2Fsecret.txt`
          )
        ).status
      ).toBe(404)
    } catch (error) {
      if (process.platform !== 'win32') throw error
    }

    const concurrentVault = tempDir('kanwas-runtime-concurrent-vault-')
    fs.writeFileSync(path.join(concurrentVault, 'concurrent.md'), '# concurrent\n')
    const [concurrentA, concurrentB] = await Promise.all([
      runtime.openVault(concurrentVault),
      runtime.openVault(concurrentVault),
    ])
    expect(concurrentA.id).toBe(concurrentB.id)
    const concurrentlyMounted = (await (await fetch(`${runtime.origin}/api/workspaces`)).json()) as Array<{
      id: string
    }>
    expect(concurrentlyMounted.filter((workspace) => workspace.id === concurrentA.id)).toHaveLength(1)
    await runtime.forgetVault(concurrentA.id)
    expect(fs.existsSync(path.join(concurrentVault, 'concurrent.md'))).toBe(true)

    const copiedVault = tempDir('kanwas-runtime-copied-vault-')
    fs.writeFileSync(path.join(copiedVault, 'copy.md'), '# copied\n')
    fs.mkdirSync(path.join(copiedVault, '.kanwas'), { recursive: true })
    fs.copyFileSync(
      path.join(vaultDir, '.kanwas', 'workspace.json'),
      path.join(copiedVault, '.kanwas', 'workspace.json')
    )
    await expect(runtime.openVault(copiedVault)).rejects.toThrow(/same Kanwas identity/)
    expect(runtime.listVaults()).toHaveLength(1)

    await runtime.forgetVault(opened.id)
    expect(runtime.listVaults()).toEqual([])
    expect(fs.readFileSync(path.join(vaultDir, 'note.md'), 'utf8')).toBe('# External edit wins\n')
    expect(fs.existsSync(vaultDir)).toBe(true)

    await runtime.close()
    await runtime.close()
    runtime = null
  }, 20_000)
})
