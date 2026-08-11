import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import pino from 'pino'
import * as yaml from 'yaml'

import type { CanvasItem } from 'shared'

import { MetadataManager } from '../../src/metadata-manager.js'
import { readMetadataYaml, writeMetadataYaml, type CanvasMetadata } from '../../src/filesystem.js'

const testLogger = pino({ level: 'silent' })

function createCanvas(id: string, name: string): CanvasItem {
  return {
    kind: 'canvas',
    id,
    name,
    xynode: {
      id,
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items: [],
  }
}

describe('MetadataManager', () => {
  let workspacePath: string

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'metadata-manager-'))
  })

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true })
  })

  it('refreshes both child and parent metadata on created_canvas', async () => {
    const root = createCanvas('root', '')
    const parent = createCanvas('canvas-parent', 'Parent')
    const child = createCanvas('canvas-child', 'Child')
    parent.items.push(child)
    root.items.push(parent)

    const parentDir = path.join(workspacePath, 'Parent')
    const childDir = path.join(workspacePath, 'Parent', 'Child')
    await fs.mkdir(childDir, { recursive: true })

    const byId = new Map<string, CanvasItem>([
      ['root', root],
      [parent.id, parent],
      [child.id, child],
    ])
    const pathById = new Map<string, string>([
      ['root', ''],
      [parent.id, 'Parent'],
      [child.id, 'Parent/Child'],
    ])

    const manager = new MetadataManager({
      logger: testLogger,
      workspacePath,
      findCanvasById: (canvasId) => byId.get(canvasId),
      getCanvasPathById: (canvasId) => pathById.get(canvasId),
      listCanvasIds: () => Array.from(byId.keys()),
    })

    await manager.handleSyncResult(path.join(childDir, 'metadata.yaml'), {
      success: true,
      action: 'created_canvas',
      canvasId: child.id,
      parentCanvasId: parent.id,
      canvas: child,
    })

    const parentMetadata = await readMetadataYaml(parentDir)
    const childMetadata = await readMetadataYaml(childDir)

    expect(parentMetadata?.id).toBe(parent.id)
    expect(childMetadata?.id).toBe(child.id)
  })

  it('refreshes parent metadata on deleted_canvas', async () => {
    const root = createCanvas('root', '')
    const parent = createCanvas('canvas-parent', 'Parent')
    parent.xynode.position = { x: 220, y: 330 }
    parent.xynode.data.audit = {
      updatedAt: '2026-02-18T00:10:00.000Z',
      updatedBy: 'agent:test-user',
    }
    root.items.push(parent)

    const parentDir = path.join(workspacePath, 'Parent')
    await fs.mkdir(parentDir, { recursive: true })

    const staleMetadata: CanvasMetadata = {
      id: parent.id,
      name: parent.name,
      xynode: {
        position: { x: 0, y: 0 },
      },
      edges: [],
      nodes: [],
    }
    await writeMetadataYaml(parentDir, staleMetadata)

    const byId = new Map<string, CanvasItem>([
      ['root', root],
      [parent.id, parent],
    ])
    const pathById = new Map<string, string>([
      ['root', ''],
      [parent.id, 'Parent'],
    ])

    const manager = new MetadataManager({
      logger: testLogger,
      workspacePath,
      findCanvasById: (canvasId) => byId.get(canvasId),
      getCanvasPathById: (canvasId) => pathById.get(canvasId),
      listCanvasIds: () => Array.from(byId.keys()),
    })

    await manager.handleSyncResult(path.join(parentDir, 'Child'), {
      success: true,
      action: 'deleted_canvas',
      canvasId: 'canvas-child',
      parentCanvasId: parent.id,
    })

    const metadata = await readMetadataYaml(parentDir)
    expect(metadata?.xynode.position).toEqual({ x: 220, y: 330 })
    expect((metadata as any)?.xynode?.data?.audit?.updatedAt).toBe('2026-02-18T00:10:00.000Z')
  })

  it('persists sections when refreshing metadata', async () => {
    const root = createCanvas('root', '')
    const canvas = createCanvas('canvas-overview', 'Overview')
    const nodeId = 'node-demo-overview'

    canvas.items.push({
      kind: 'node',
      id: nodeId,
      name: 'demo-overview',
      xynode: {
        id: nodeId,
        type: 'blockNote',
        position: { x: 24, y: 64 },
        data: { sectionId: 'section-overview' },
      },
    })
    canvas.sections = [
      {
        id: 'section-overview',
        title: 'Overview',
        layout: 'horizontal',
        position: { x: 0, y: 0 },
        memberIds: [nodeId],
        columns: 2,
      },
    ]
    root.items.push(canvas)

    const canvasDir = path.join(workspacePath, 'Overview')
    await fs.mkdir(canvasDir, { recursive: true })

    const byId = new Map<string, CanvasItem>([
      ['root', root],
      [canvas.id, canvas],
    ])
    const pathById = new Map<string, string>([
      ['root', ''],
      [canvas.id, 'Overview'],
    ])

    const manager = new MetadataManager({
      logger: testLogger,
      workspacePath,
      findCanvasById: (canvasId) => byId.get(canvasId),
      getCanvasPathById: (canvasId) => pathById.get(canvasId),
      listCanvasIds: () => Array.from(byId.keys()),
    })

    await manager.refreshCanvasMetadata(canvas.id)

    const metadata = await readMetadataYaml(canvasDir)
    expect(metadata?.sections).toEqual([
      {
        id: 'section-overview',
        title: 'Overview',
        layout: 'horizontal',
        position: { x: 0, y: 0 },
        memberIds: [nodeId],
        columns: 2,
      },
    ])
    expect(metadata?.nodes[0]?.xynode.data.sectionId).toBe('section-overview')
  })

  it('includes canvas and node measured fields when refreshing metadata', async () => {
    const root = createCanvas('root', '')
    const canvas = createCanvas('canvas-measured', 'Measured Canvas')
    canvas.xynode.position = { x: 220, y: 330 }
    canvas.xynode.measured = { width: 1200, height: 900 }
    canvas.items.push({
      kind: 'node',
      id: 'node-1',
      name: 'demo-note',
      xynode: {
        id: 'node-1',
        type: 'blockNote',
        position: { x: 24, y: 64 },
        measured: { width: 320, height: 180 },
        data: {},
      },
    })
    root.items.push(canvas)

    const canvasDir = path.join(workspacePath, 'Measured Canvas')
    await fs.mkdir(canvasDir, { recursive: true })

    const byId = new Map<string, CanvasItem>([
      ['root', root],
      [canvas.id, canvas],
    ])
    const pathById = new Map<string, string>([
      ['root', ''],
      [canvas.id, 'Measured Canvas'],
    ])

    const manager = new MetadataManager({
      logger: testLogger,
      workspacePath,
      findCanvasById: (canvasId) => byId.get(canvasId),
      getCanvasPathById: (canvasId) => pathById.get(canvasId),
      listCanvasIds: () => Array.from(byId.keys()),
    })

    await manager.refreshCanvasMetadata(canvas.id)

    const rawMetadata = await fs.readFile(path.join(canvasDir, 'metadata.yaml'), 'utf-8')
    const writtenMetadata = yaml.parse(rawMetadata)

    expect(writtenMetadata.xynode.position).toEqual({ x: 220, y: 330 })
    expect(writtenMetadata.xynode.measured).toEqual({ width: 1200, height: 900 })
    expect(writtenMetadata.nodes[0].xynode.measured).toEqual({ width: 320, height: 180 })
  })
})
