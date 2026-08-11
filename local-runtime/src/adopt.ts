// Folder → yDoc adoption (metadata-first, id-stable, NON-DESTRUCTIVE).
//
// Builds a fresh, disposable yDoc from the folder on disk. NEVER wipes the
// folder, NEVER hydrates yDoc→folder.
//
// The naive `FilesystemSyncer` full scan mints a fresh UUID for every created
// node/canvas and has no path to recover ids from metadata.yaml (verified:
// createNode/createCanvas both call crypto.randomUUID()). So a naive scan is NOT
// id-stable across restarts. To make node/canvas identity survive restarts, this
// loader reconstructs canvases + nodes with their STORED ids from the
// `metadata.yaml` sidecars first, and only falls back to the FilesystemSyncer
// create path for files/dirs that have no sidecar yet (genuinely new content).
//
//   Pass A: walk dirs top-down; build every canvas (stored id if the dir has a
//           valid metadata.yaml, else a fresh id) + reconstruct metadata-listed
//           nodes with stored ids/positions/data. Create empty subdocs for
//           content nodes (blockNote/stickyNote).
//   Pass B: build the PathMapper from the tree; walk disk files. Files that map
//           to a reconstructed content node get their content filled via the
//           crown-jewel FilesystemSyncer update path; unmapped files (new /
//           sidecar-less) are created (fresh id).
//   Pass C: prune reconstructed nodes whose backing file vanished while the
//           runtime was off (keeps the canvas faithful to the folder).
//
// Everything runs against an offline yDoc, then the caller serializes a snapshot
// bundle and replaceDocument()s it into the embedded room (exactly as the spike
// seed did).
import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import * as Y from 'yjs'
import { createYjsProxy } from 'valtio-y'
import type { Logger } from 'pino'
import { PathMapper, sanitizeFilename } from 'shared'
import type { CanvasItem, CanvasMetadata, NodeItem, WorkspaceDocument } from 'shared'
import {
  ContentConverter,
  FilesystemSyncer,
  createWorkspaceContentStore,
  type FileChange,
  type FileUploadResult,
  type WorkspaceContentStore,
} from 'shared/server'
import { KANWAS_DIR } from './identity.js'
import { readMetadataYaml } from './filesystem.js'
import { rebuildDiskAlignedMappings } from './disk-align.js'
import { splitFrontmatter } from './frontmatter.js'
import type { FrontmatterRegistry } from './frontmatter-registry.js'
import { nodeFileClass } from './name-match.js'

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.mp3', '.wav', '.m4a', '.svg'])
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', '.DS_Store', KANWAS_DIR])
const SUBDOC_NODE_TYPES = new Set(['blockNote', 'stickyNote'])
/** Node types that ALWAYS have a backing file (the flusher writes one). text/link
 *  are metadata-only, so a missing file must not prune them. */
const REQUIRES_BACKING_FILE = new Set(['blockNote', 'stickyNote', 'image', 'file', 'audio'])

export interface AdoptResult {
  yDoc: Y.Doc
  proxy: WorkspaceDocument
  contentStore: WorkspaceContentStore
  canvasCount: number
  nodeCount: number
  /** True when the folder was empty and a placeholder note was seeded (in-memory only). */
  seededEmpty: boolean
  /** Canvas ids whose sidecar node names became stale after an offline-rename recovery. */
  recoveredCanvasIds: string[]
}

interface DirInfo {
  abs: string
  /** folder-relative POSIX path ('' = root). */
  rel: string
  canvasId: string
}

function isObjectRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isValidCanvasMetadata(m: unknown): m is CanvasMetadata {
  if (!isObjectRecord(m)) return false
  return (
    typeof m.id === 'string' &&
    m.id.length > 0 &&
    typeof m.name === 'string' &&
    isObjectRecord(m.xynode) &&
    Array.isArray(m.nodes) &&
    Array.isArray(m.edges)
  )
}

function stripAudit(data: unknown): Record<string, unknown> {
  if (!isObjectRecord(data)) return {}
  return Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'audit'))
}

function findCanvasById(root: CanvasItem | undefined, id: string): CanvasItem | undefined {
  if (!root) return undefined
  if (root.id === id) return root
  for (const item of root.items) {
    if (item.kind === 'canvas') {
      const found = findCanvasById(item, id)
      if (found) return found
    }
  }
  return undefined
}

function findNodeById(root: CanvasItem | undefined, id: string): NodeItem | undefined {
  if (!root) return undefined
  for (const item of root.items) {
    if (item.kind === 'node') {
      if (item.id === id) return item
    } else {
      const found = findNodeById(item, id)
      if (found) return found
    }
  }
  return undefined
}

/**
 * Re-pair reconstructed (fileless) nodes with files renamed/moved while the runtime
 * was off. Registers the PathMapper mapping so Pass B fills the EXISTING node (id
 * preserved) instead of creating a duplicate, and updates the node's name/
 * storagePath to follow the file so the flusher does not undo the rename.
 */
async function recoverRenamedIdentities(opts: {
  proxy: WorkspaceDocument
  pathMapper: PathMapper
  folder: string
  contentFiles: string[]
  reconstructedNodeIds: Set<string>
  log: Logger
}): Promise<Set<string>> {
  const { proxy, pathMapper, folder, contentFiles, reconstructedNodeIds, log } = opts
  const recoveredCanvasIds = new Set<string>()

  // buildFromWorkspace seeds a SANITIZED-name path for every node (e.g. notes →
  // "notes.md") that align only overrides when a real file matches; a renamed file
  // leaves that stale path in place. So "fileless" must be judged against the
  // ACTUAL files on disk, not merely whether a mapping exists.
  const diskSet = new Set(contentFiles)
  const isFileless = (nodeId: string): boolean => {
    const p = pathMapper.getPathForNode(nodeId)
    return p === undefined || !diskSet.has(p)
  }
  const isFileUnmapped = (rel: string): boolean => {
    const m = pathMapper.getMapping(rel)
    return !m || !diskSet.has(m.path)
  }

  const filesByDir = new Map<string, string[]>()
  for (const rel of contentFiles) {
    const slash = rel.lastIndexOf('/')
    const dir = slash === -1 ? '' : rel.slice(0, slash)
    if (!filesByDir.has(dir)) filesByDir.set(dir, [])
    filesByDir.get(dir)!.push(rel)
  }

  const stemOf = (rel: string, ext: string): string => {
    const base = rel.split('/').pop() ?? rel
    return base.toLowerCase().endsWith(ext.toLowerCase()) ? base.slice(0, base.length - ext.length) : base
  }
  const binaryStem = (rel: string): string => {
    const base = rel.split('/').pop() ?? rel
    const dot = base.lastIndexOf('.')
    return dot > 0 ? base.slice(0, dot) : base
  }

  const walk = async (canvas: CanvasItem): Promise<void> => {
    const dir = pathMapper.getPathForCanvas(canvas.id) ?? ''
    const unmapped = (filesByDir.get(dir) ?? []).filter((f) => isFileUnmapped(f))
    const fileless = canvas.items.filter(
      (i): i is NodeItem =>
        i.kind === 'node' &&
        reconstructedNodeIds.has(i.id) &&
        nodeFileClass(i.xynode.type) !== 'none' &&
        isFileless(i.id)
    )
    const claim = (f: string, node: NodeItem): void => {
      pathMapper.addMapping({ path: f, nodeId: node.id, canvasId: canvas.id, originalName: node.name, type: 'node' })
      const idx = unmapped.indexOf(f)
      if (idx !== -1) unmapped.splice(idx, 1)
    }

    // Binaries: match by stored contentHash (reliable — the file bytes are identical).
    for (const node of fileless) {
      if (nodeFileClass(node.xynode.type) !== 'binary') continue
      const wantHash = (node.xynode.data as { contentHash?: unknown }).contentHash
      if (typeof wantHash !== 'string' || wantHash.length === 0) continue
      for (const f of [...unmapped]) {
        if (!BINARY_EXT.has(path.extname(f).toLowerCase())) continue
        const bytes = await fsp.readFile(path.join(folder, f))
        if (createHash('sha256').update(bytes).digest('hex') !== wantHash) continue
        ;(node.xynode.data as Record<string, unknown>).storagePath = f
        node.name = sanitizeFilename(binaryStem(f))
        claim(f, node)
        recoveredCanvasIds.add(canvas.id)
        log.info({ nodeId: node.id, file: f }, 'Recovered binary identity across offline rename (contentHash)')
        break
      }
    }

    // Content files: unambiguous 1:1 within the canvas (per class).
    for (const [cls, ext] of [
      ['markdown', '.md'],
      ['sticky', '.sticky.yaml'],
    ] as const) {
      const nodes = fileless.filter((n) => nodeFileClass(n.xynode.type) === cls && isFileless(n.id))
      const files = unmapped.filter((f) => f.toLowerCase().endsWith(ext))
      if (nodes.length === 1 && files.length === 1) {
        const node = nodes[0]
        const f = files[0]
        node.name = sanitizeFilename(stemOf(f, ext))
        claim(f, node)
        recoveredCanvasIds.add(canvas.id)
        log.info({ nodeId: node.id, file: f }, 'Recovered content identity across offline rename (1:1)')
      }
    }

    for (const item of canvas.items) if (item.kind === 'canvas') await walk(item)
  }
  if (proxy.root) await walk(proxy.root)
  return recoveredCanvasIds
}

/** Reconstruct a NodeItem from a metadata.yaml node entry, preserving its stored id. */
function reconstructNode(meta: CanvasMetadata['nodes'][number]): NodeItem {
  const xynode = {
    id: meta.xynode.id,
    type: meta.xynode.type,
    position: { ...meta.xynode.position },
    ...(meta.xynode.measured ? { measured: { ...meta.xynode.measured } } : {}),
    data: stripAudit(meta.xynode.data),
    ...(typeof meta.xynode.width === 'number' ? { width: meta.xynode.width } : {}),
    ...(typeof meta.xynode.height === 'number' ? { height: meta.xynode.height } : {}),
  } as NodeItem['xynode']

  return {
    kind: 'node',
    id: meta.id,
    name: meta.name,
    xynode,
    ...(meta.collapsed !== undefined ? { collapsed: meta.collapsed } : {}),
    ...(meta.summary !== undefined ? { summary: meta.summary } : {}),
    ...(meta.emoji !== undefined ? { emoji: meta.emoji } : {}),
  }
}

/** List immediate child dirs and content files of a directory (sorted, filtered). */
async function listDir(abs: string): Promise<{ dirs: string[]; files: string[] }> {
  const entries = await fsp.readdir(abs, { withFileTypes: true })
  const dirs: string[] = []
  const files: string[] = []
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.') || SKIP_DIR_NAMES.has(e.name)) continue
    if (e.isDirectory()) dirs.push(e.name)
    else if (e.isFile() && e.name !== 'metadata.yaml') files.push(e.name)
  }
  return { dirs, files }
}

export async function adoptFolder(options: {
  folder: string
  rootId: string
  logger: Logger
  /** Populated with each `.md` file's frontmatter block (keyed by node id). */
  frontmatter?: FrontmatterRegistry
}): Promise<AdoptResult> {
  const { folder, rootId, logger, frontmatter } = options
  const log = logger.child({ component: 'Adopt' })

  const yDoc = new Y.Doc()
  const { bootstrap, proxy } = createYjsProxy<WorkspaceDocument>(yDoc, {
    getRoot: (doc: Y.Doc) => doc.getMap('state'),
  })

  // Root canvas: constant id. Recover edges/groups/sections/name from a root
  // sidecar (<folder>/metadata.yaml) if present.
  const rootMeta = await readMetadataYaml(folder).catch(() => undefined)
  const rootValid = isValidCanvasMetadata(rootMeta)
  bootstrap({
    root: {
      kind: 'canvas',
      id: rootId,
      name: rootValid ? rootMeta!.name : '',
      xynode: { id: rootId, type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: rootValid ? rootMeta!.edges.map((e) => ({ ...e })) : [],
      items: [],
      groups: rootValid && rootMeta!.groups ? rootMeta!.groups : [],
      sections: rootValid && rootMeta!.sections ? rootMeta!.sections : [],
    } satisfies CanvasItem,
  })

  const contentStore = createWorkspaceContentStore(yDoc)
  const pathMapper = new PathMapper()
  const contentConverter = new ContentConverter()

  // fileUploader returns the vault-relative storagePath so the signed-url static
  // route can serve the bytes straight from disk.
  let currentRelPath: string | null = null
  const fileUploader = async (
    buffer: Buffer,
    _canvasId: string,
    filename: string,
    mimeType: string
  ): Promise<FileUploadResult> => ({ storagePath: currentRelPath ?? filename, mimeType, size: buffer.length })
  const fileReader = async (rel: string): Promise<Buffer> => fsp.readFile(path.join(folder, rel))

  // ---- Pass A: build all canvases (stored ids where sidecars exist) + nodes ----
  const reconstructedNodeIds = new Set<string>()

  const walkDir = async (info: DirInfo): Promise<void> => {
    const meta = await readMetadataYaml(info.abs).catch((e) => {
      log.warn({ dir: info.rel, error: String(e) }, 'Ignoring unparseable metadata.yaml')
      return undefined
    })
    // Root sidecar already applied above; only reconstruct nodes here for root.
    if (isValidCanvasMetadata(meta)) {
      const canvas = findCanvasById(proxy.root, info.canvasId)
      if (canvas) {
        for (const metaNode of meta.nodes) {
          if (!isObjectRecord(metaNode) || typeof metaNode.id !== 'string') continue
          const node = reconstructNode(metaNode)
          canvas.items.push(node)
          reconstructedNodeIds.add(node.id)
          if (SUBDOC_NODE_TYPES.has(node.xynode.type)) {
            contentStore.createNoteDoc(node.id, node.xynode.type === 'stickyNote' ? 'stickyNote' : 'blockNote')
          }
        }
      }
    }

    const { dirs } = await listDir(info.abs)
    let siblingIndex = findCanvasById(proxy.root, info.canvasId)?.items.filter((i) => i.kind === 'canvas').length ?? 0
    for (const childName of dirs) {
      const childAbs = path.join(info.abs, childName)
      const childRel = info.rel ? `${info.rel}/${childName}` : childName
      const childMeta = await readMetadataYaml(childAbs).catch(() => undefined)
      const valid = isValidCanvasMetadata(childMeta)
      const childId = valid ? childMeta!.id : crypto.randomUUID()
      const parent = findCanvasById(proxy.root, info.canvasId)
      if (!parent) continue
      const childCanvas: CanvasItem = {
        kind: 'canvas',
        id: childId,
        name: valid ? childMeta!.name : childName,
        xynode: {
          id: childId,
          type: 'canvas',
          position: valid ? { ...childMeta!.xynode.position } : { x: 0, y: siblingIndex * 220 },
          data: {},
        },
        edges: valid ? childMeta!.edges.map((e) => ({ ...e })) : [],
        items: [],
        groups: valid && childMeta!.groups ? childMeta!.groups : [],
        sections: valid && childMeta!.sections ? childMeta!.sections : [],
      }
      parent.items.push(childCanvas)
      siblingIndex++
      await walkDir({ abs: childAbs, rel: childRel, canvasId: childId })
    }
  }

  await walkDir({ abs: folder, rel: '', canvasId: rootId })

  // ---- Pass B: fill reconstructed content + create sidecar-less files ----
  rebuildDiskAlignedMappings(pathMapper, proxy, folder)
  const syncer = new FilesystemSyncer({
    proxy,
    yDoc,
    contentStore,
    pathMapper,
    contentConverter,
    fileUploader,
    fileReader,
    autoCreateCanvases: true,
  })

  const contentFiles: string[] = []
  const collectFiles = async (abs: string, rel: string): Promise<void> => {
    const { dirs, files } = await listDir(abs)
    for (const f of files) contentFiles.push(rel ? `${rel}/${f}` : f)
    for (const d of dirs) await collectFiles(path.join(abs, d), rel ? `${rel}/${d}` : d)
  }
  await collectFiles(folder, '')

  // ---- Recover identity for files renamed/moved WHILE THE DAEMON WAS OFF ----
  // The sidecar still lists the old filename, so the disk-aligned PathMapper left
  // the reconstructed node fileless and the renamed file unmapped — which would
  // otherwise yield a ghost node + a duplicate. Re-pair them so the node id (and
  // its edges/position) survive: binaries by stored contentHash, content files by
  // an unambiguous 1:1 match within a canvas. Paired nodes get their name/
  // storagePath updated to follow the file so the flusher won't rename it back.
  const recoveredCanvasIds = await recoverRenamedIdentities({
    proxy,
    pathMapper,
    folder,
    contentFiles,
    reconstructedNodeIds,
    log,
  })

  for (const rel of contentFiles) {
    const mapping = pathMapper.getMapping(rel)
    const ext = path.extname(rel).toLowerCase()
    try {
      if (mapping) {
        // Reconstructed node: only content-bearing (subdoc) types need a fill;
        // binary/text/url nodes are fully described by metadata already.
        if (rel.endsWith('.md')) {
          const raw = await fsp.readFile(path.join(folder, rel), 'utf-8')
          const { frontmatter: fm, body } = splitFrontmatter(raw)
          frontmatter?.set(mapping.nodeId, fm)
          await syncer.syncChange({ type: 'update', path: rel, content: body })
        } else if (rel.endsWith('.sticky.yaml')) {
          const content = await fsp.readFile(path.join(folder, rel), 'utf-8')
          await syncer.syncChange({ type: 'update', path: rel, content })
        }
        continue
      }
      // Sidecar-less / new file → create (fresh id).
      let change: FileChange
      let createdFrontmatter: string | null = null
      if (BINARY_EXT.has(ext)) {
        currentRelPath = rel
        change = { type: 'create', path: rel, binaryContent: await fsp.readFile(path.join(folder, rel)) }
      } else if (rel.endsWith('.md')) {
        const { frontmatter: fm, body } = splitFrontmatter(await fsp.readFile(path.join(folder, rel), 'utf-8'))
        createdFrontmatter = fm
        change = { type: 'create', path: rel, content: body }
      } else if (rel.endsWith('.yaml')) {
        // .sticky.yaml / .text.yaml / .url.yaml — syncChange routes by suffix.
        change = { type: 'create', path: rel, content: await fsp.readFile(path.join(folder, rel), 'utf-8') }
      } else {
        // Not a node-backing file type (.html, .mp4, .sh, .js, .json, …). The
        // runtime watcher skips these via prepareContent(); mirror that here.
        // Otherwise syncChange treats the file as a canvas directory and later
        // tries to write metadata.yaml *inside* it → ENOTDIR crash on adoption.
        continue
      }
      const res = await syncer.syncChange(change)
      if (!('success' in res) || !res.success) {
        log.warn({ rel, error: 'error' in res ? res.error : 'unknown' }, 'syncChange failed during adoption')
      } else if (createdFrontmatter !== null && res.nodeId) {
        frontmatter?.set(res.nodeId, createdFrontmatter)
      }
    } catch (error) {
      log.warn({ rel, error: String(error) }, 'Failed to adopt file')
    } finally {
      currentRelPath = null
    }
  }

  // ---- Pass C: prune reconstructed nodes whose backing file vanished offline ----
  // A file-backed node (blockNote/sticky/binary) with no file on disk is a ghost —
  // either its file was deleted offline, or it was renamed to a file that recovery
  // could not unambiguously re-pair (so a fresh node already represents that file).
  // Pruning it here guarantees NO duplicate/ghost nodes. text/link are metadata-
  // only and are never pruned for a missing file.
  rebuildDiskAlignedMappings(pathMapper, proxy, folder)
  const diskSet = new Set(contentFiles)
  for (const nodeId of reconstructedNodeIds) {
    const node = findNodeById(proxy.root, nodeId)
    // text/link are metadata-only (no backing file); a missing file must NOT prune
    // them, or every UI-created text/link node would vanish on restart.
    if (!node || !REQUIRES_BACKING_FILE.has(node.xynode.type)) continue
    const nodePath = pathMapper.getPathForNode(nodeId)
    if (nodePath !== undefined && diskSet.has(nodePath)) continue // has a real file → keep
    // Delete through the syncer (safe valtio-y removal + edge/group cleanup). Its
    // stale sanitized-name path is still a valid mapping key.
    if (nodePath !== undefined) {
      await syncer.syncChange({ type: 'delete', path: nodePath }).catch(() => undefined)
    }
    frontmatter?.delete(nodeId)
    log.debug({ nodeId, type: node.xynode.type, nodePath }, 'Pruned reconstructed node with no backing file')
  }

  // Let valtio-y flush batched proxy→yDoc writes.
  await new Promise((r) => setTimeout(r, 100))

  // Empty folder → seed an ephemeral welcome note (in-memory only, no disk write)
  // so a brand-new folder renders as a non-empty canvas.
  let seededEmpty = false
  if ((proxy.root?.items.length ?? 0) === 0) {
    await syncer
      .syncChange({
        type: 'create',
        path: 'welcome.md',
        content:
          '# Welcome to Kanwas\n\nThis folder is now a Kanwas workspace. Add `.md` files and folders to build your canvas.\n',
      })
      .catch((e) => log.warn({ error: String(e) }, 'Failed to seed welcome note'))
    seededEmpty = true
    await new Promise((r) => setTimeout(r, 50))
  }

  const canvasCount = countCanvases(proxy.root)
  const nodeCount = countNodes(proxy.root)
  log.info({ canvasCount, nodeCount, reconstructed: reconstructedNodeIds.size, seededEmpty }, 'Folder adopted')

  return { yDoc, proxy, contentStore, canvasCount, nodeCount, seededEmpty, recoveredCanvasIds: [...recoveredCanvasIds] }
}

function countCanvases(root: CanvasItem | undefined): number {
  if (!root) return 0
  let n = 1
  for (const item of root.items) if (item.kind === 'canvas') n += countCanvases(item)
  return n
}
function countNodes(root: CanvasItem | undefined): number {
  if (!root) return 0
  let n = 0
  for (const item of root.items) {
    if (item.kind === 'node') n++
    else n += countNodes(item)
  }
  return n
}
