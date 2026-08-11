import { useCallback, useContext } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useReactFlow } from '@xyflow/react'
import type { Doc as YDoc } from 'yjs'
import { WorkspaceContext } from '@/providers/workspace/WorkspaceContext'
import { useAuthState } from '@/providers/auth'
import { useGetEditor } from '@/providers/project-state/hooks'
import { tuyau } from '@/api/client'
import type {
  CanvasItem,
  NodeItem,
  ImageNodeData,
  FileNodeData,
  AudioNodeData,
  LinkNodeData,
  TextNodeData,
  StickyNoteNodeData,
} from 'shared'
import {
  calculateItemPosition,
  findTargetCanvas,
  NODE_LAYOUT,
  CANVAS_NODE_LAYOUT,
  IMAGE_NODE_LAYOUT,
  FILE_NODE_LAYOUT,
  AUDIO_NODE_LAYOUT,
  LINK_NODE_LAYOUT,
  TEXT_NODE_LAYOUT,
  STICKY_NOTE_NODE_LAYOUT,
  MAX_IMAGE_SIZE_BYTES,
  calculateImageDisplaySize,
  SUPPORTED_FILE_EXTENSIONS,
  SUPPORTED_AUDIO_EXTENSIONS,
  type SupportedFileExtension,
  type SupportedAudioExtension,
} from 'shared/constants'
import { useVisibleCanvasArea } from './useVisibleCanvasArea'
import { NODE_NAME_HEIGHT } from './canvasLayout'
import { useUploadImage } from '@/hooks/useUploadImage'
import { showToast } from '@/utils/toast'
import { computeFileHash } from '@/lib/hash'
import { getAutoEmbed, isSafeExternalUrl } from '@/lib/embeds'
import {
  canvasContainsNodeId,
  findCanvasById,
  findCanonicalKanwasNodeId,
  findNodeById,
  isReservedTopLevelCanvas,
} from '@/lib/workspaceUtils'
import { getUniqueSiblingName } from '@/lib/workspaceItemNames'
import { blocksToYXmlFragment } from '@/lib/ydoc-utils'
import {
  getImportedContentParser,
  parseBlockNoteClipboardHtmlToBlocks,
  parseImportedContentToBlocks,
  type ImportedBlocks,
} from '@/lib/blocknote-import'
import {
  appendCanvasWithCreateAudit,
  appendNodeWithCreateAudit,
  createUserAuditActor,
  touchNodeAndOwnerCanvasAudit,
} from '@/lib/workspaceAudit'
import { createNoteDoc, findNoteBlockNoteFragment } from '@/lib/workspaceNoteDoc'
import {
  createNoteDocForNode,
  deleteNoteDocsForRemovedItems,
  rememberDeletedNoteDocsForRemovedItems,
} from '@/lib/workspaceNoteLifecycle'
import { WORKSPACE_NOTE_COMMAND_ORIGIN } from '@/lib/workspaceUndo'
import { deleteCanvasItemsFromCanvas } from './deleteCanvasItems'

function deriveImportedDocumentName(content: string, format: 'text' | 'markdown' | 'html'): string {
  const normalizedContent =
    format === 'html' ? (new DOMParser().parseFromString(content, 'text/html').body.textContent ?? '') : content

  const firstLine = normalizedContent
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine ? firstLine.slice(0, 80) : 'New Document'
}

function findCanvasParent(root: CanvasItem, canvasId: string): CanvasItem | null {
  for (const item of root.items) {
    if (item.kind === 'canvas') {
      if (item.id === canvasId) {
        return root
      }

      const nestedParent = findCanvasParent(item, canvasId)
      if (nestedParent) {
        return nestedParent
      }
    }
  }

  return null
}

function getUniqueNameForNewNode(
  parentCanvas: CanvasItem,
  preferredName: string,
  target: { type: NodeItem['xynode']['type']; originalFilename?: string; mimeType?: string }
): string {
  return getUniqueSiblingName({
    siblings: parentCanvas.items,
    preferredName,
    target: { kind: 'node', ...target },
  })
}

function getUniqueNameForExistingNode(root: CanvasItem, nodeId: string, preferredName: string): string | null {
  const located = findNodeById(root, nodeId)
  if (!located) return null

  const ownerCanvas = findCanvasById(root, located.canvasId)
  if (!ownerCanvas) return null

  return getUniqueSiblingName({
    siblings: ownerCanvas.items,
    preferredName,
    excludeItemId: nodeId,
    target: {
      kind: 'node',
      type: located.node.xynode.type,
      originalFilename:
        located.node.xynode.type === 'file' || located.node.xynode.type === 'audio'
          ? (located.node.xynode.data as { originalFilename?: string }).originalFilename
          : undefined,
      mimeType:
        located.node.xynode.type === 'image' ? (located.node.xynode.data as { mimeType?: string }).mimeType : undefined,
    },
  })
}

/**
 * Get image dimensions from a File using browser Image API
 */
async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('Failed to load image'))
    }
    img.src = URL.createObjectURL(file)
  })
}

export const useSelectNode = () => {
  const reactFlowInstance = useReactFlow()

  return useCallback(
    (nodeId: string) => {
      reactFlowInstance.setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          selected: node.id === nodeId,
        }))
      )
    },
    [reactFlowInstance]
  )
}

export const useFocusNode = () => {
  const getEditor = useGetEditor()

  return useCallback(
    (nodeId: string, delay = 200) => {
      setTimeout(() => {
        const editor = getEditor(nodeId)
        if (editor) {
          editor.focus()
        }
      }, delay)
    },
    [getEditor]
  )
}

export const useUserFacingNodeEdit = () => {
  const { store, workspaceUndoController } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const auditActor = createUserAuditActor(user?.id)

  return useCallback(
    (nodeId: string, mutate: (node: NodeItem) => void): boolean => {
      const root = store.root
      if (!root) return false

      const located = findNodeById(root, nodeId)
      if (!located) return false

      workspaceUndoController.runCommand(() => {
        mutate(located.node)
      })

      touchNodeAndOwnerCanvasAudit(root, nodeId, auditActor, new Date().toISOString())
      return true
    },
    [store, workspaceUndoController, auditActor]
  )
}

export const useFitNodeInView = () => {
  const reactFlowInstance = useReactFlow()
  const visibleArea = useVisibleCanvasArea()

  return useCallback(
    (nodeId: string) => {
      const node = reactFlowInstance.getNode(nodeId)
      if (!node) return

      const { centerX } = visibleArea
      const currentViewport = reactFlowInstance.getViewport()

      const nodeWidth = node.measured?.width || node.width || NODE_LAYOUT.WIDTH

      // Center horizontally, but show from the TOP of the node (with some padding)
      const nodeCenterX = node.position.x + nodeWidth / 2
      const nodeTopY = node.position.y

      const viewportX = centerX - nodeCenterX * currentViewport.zoom
      const viewportY = 100 - nodeTopY * currentViewport.zoom // 100px padding from top

      reactFlowInstance.setViewport({ x: viewportX, y: viewportY, zoom: currentViewport.zoom }, { duration: 0 })
    },
    [reactFlowInstance, visibleArea]
  )
}

/**
 * Focus on a node at 100% zoom - used for double-click "focus" action
 * Centers the node horizontally and shows from top at exactly 100% zoom
 * Returns true if viewport changed, false if already at correct position
 */
export const useFocusNodeAt100 = () => {
  const reactFlowInstance = useReactFlow()
  const visibleArea = useVisibleCanvasArea()

  return useCallback(
    (nodeId: string): { found: boolean; moved: boolean } => {
      const node = reactFlowInstance.getNode(nodeId)
      if (!node) return { found: false, moved: false }

      const { centerX } = visibleArea
      const zoom = 1 // 100% zoom

      const nodeWidth = node.measured?.width || node.width || NODE_LAYOUT.WIDTH

      // Center horizontally, show from TOP of node with padding, at 100% zoom
      const nodeCenterX = node.position.x + nodeWidth / 2
      const nodeTopY = node.position.y

      const viewportX = centerX - nodeCenterX * zoom
      const viewportY = 100 - nodeTopY * zoom // 100px padding from top

      // Check if viewport would actually change (within small threshold)
      const currentViewport = reactFlowInstance.getViewport()
      const threshold = 5
      const wouldChange =
        Math.abs(currentViewport.x - viewportX) > threshold ||
        Math.abs(currentViewport.y - viewportY) > threshold ||
        Math.abs(currentViewport.zoom - zoom) > 0.01

      if (wouldChange) {
        reactFlowInstance.setViewport({ x: viewportX, y: viewportY, zoom }, { duration: 0 })
      }

      return { found: true, moved: wouldChange }
    },
    [reactFlowInstance, visibleArea]
  )
}

// Add a new node to a canvas
export const useAddNode = () => {
  const { store, yDoc, workspaceUndoController } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const auditActor = createUserAuditActor(user?.id)

  return useCallback(
    (options?: {
      documentName?: string
      isPreviewCreate?: boolean
      canvasId?: string
      position?: { x: number; y: number }
    }) => {
      const targetCanvas = findTargetCanvas(store.root, options?.canvasId)
      if (!targetCanvas) {
        console.warn('[useAddNode] No canvas found to add node to')
        return ''
      }

      // Calculate position: use provided position, otherwise auto-position
      const nodeItems = targetCanvas.items.filter((i) => i.kind === 'node')
      const position = options?.position
        ? options.position
        : calculateItemPosition(nodeItems, { direction: 'horizontal', defaultSize: NODE_LAYOUT.WIDTH })

      // Create the new node
      const nodeId = crypto.randomUUID()
      const nowIso = new Date().toISOString()
      const nodeName = getUniqueNameForNewNode(targetCanvas, options?.documentName || 'New Document', {
        type: 'blockNote',
      })
      const newNodeItem: NodeItem = {
        id: nodeId,
        name: nodeName,
        kind: 'node' as const,
        collapsed: false as const,
        xynode: {
          id: nodeId,
          type: 'blockNote' as const,
          position,
          initialWidth: NODE_LAYOUT.DEFAULT_MEASURED.width,
          initialHeight: NODE_LAYOUT.DEFAULT_MEASURED.height,
          data: {
            isPreviewCreate: options?.isPreviewCreate || false,
          },
        },
      }

      workspaceUndoController.runCommand(() => {
        createNoteDocForNode(yDoc, nodeId, newNodeItem.xynode.type)
        appendNodeWithCreateAudit(targetCanvas, newNodeItem, auditActor, nowIso)
      })

      return nodeId
    },
    [store, yDoc, workspaceUndoController, auditActor]
  )
}

export const useAddBlockNoteNodeFromImport = () => {
  const { store, yDoc, workspaceUndoController } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const auditActor = createUserAuditActor(user?.id)

  return useCallback(
    (options: {
      content: string
      format: 'text' | 'markdown' | 'html'
      source?: 'blocknoteClipboard'
      documentName?: string
      canvasId?: string
      position?: { x: number; y: number }
    }): string | null => {
      const targetCanvas = findTargetCanvas(store.root, options.canvasId)
      if (!targetCanvas) {
        showToast('No canvas found', 'error')
        return null
      }

      let blocks: ImportedBlocks
      try {
        if (options.source === 'blocknoteClipboard') {
          const result = parseBlockNoteClipboardHtmlToBlocks(options.content)
          if (!result.ok) {
            throw result.error
          }
          blocks = result.blocks
        } else {
          blocks = parseImportedContentToBlocks(options.content, options.format)
        }
      } catch {
        showToast('Could not parse pasted content', 'error')
        return null
      }

      const nodeItems = targetCanvas.items.filter((i) => i.kind === 'node')
      const position =
        options.position ??
        calculateItemPosition(nodeItems, { direction: 'horizontal', defaultSize: NODE_LAYOUT.WIDTH })

      const nodeId = crypto.randomUUID()
      const nowIso = new Date().toISOString()
      const nodeName = getUniqueNameForNewNode(
        targetCanvas,
        options.documentName ?? deriveImportedDocumentName(options.content, options.format),
        { type: 'blockNote' }
      )
      const newNodeItem: NodeItem = {
        id: nodeId,
        name: nodeName,
        kind: 'node' as const,
        collapsed: false as const,
        xynode: {
          id: nodeId,
          type: 'blockNote' as const,
          position,
          initialWidth: NODE_LAYOUT.DEFAULT_MEASURED.width,
          initialHeight: NODE_LAYOUT.DEFAULT_MEASURED.height,
          data: {},
        },
      }

      try {
        workspaceUndoController.runCommand(() => {
          let noteDoc: YDoc | null = null
          yDoc.transact(() => {
            noteDoc = createNoteDoc(yDoc, nodeId, 'blockNote')
          }, WORKSPACE_NOTE_COMMAND_ORIGIN)

          if (!noteDoc) {
            throw new Error(`Imported note ${nodeId} could not be created`)
          }

          const attachedNoteDoc = noteDoc as YDoc & { transact: (fn: () => void, origin?: unknown) => void }

          const fragment = findNoteBlockNoteFragment(attachedNoteDoc)
          if (!fragment) {
            throw new Error(`Imported note ${nodeId} is missing block note content`)
          }

          appendNodeWithCreateAudit(targetCanvas, newNodeItem, auditActor, nowIso)

          attachedNoteDoc.transact(() => {
            if (fragment.length > 0) {
              fragment.delete(0, fragment.length)
            }

            blocksToYXmlFragment(blocks, getImportedContentParser().pmSchema, fragment)
          }, WORKSPACE_NOTE_COMMAND_ORIGIN)
        })
      } catch {
        showToast('Could not import pasted content', 'error')
        return null
      }

      return nodeId
    },
    [store, yDoc, workspaceUndoController, auditActor]
  )
}

// Add an image node to a canvas
export const useAddImageNode = () => {
  const { store, workspaceId } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const uploadImage = useUploadImage()
  const auditActor = createUserAuditActor(user?.id)

  return useCallback(
    async (options: { file: File; canvasId?: string; position?: { x: number; y: number } }): Promise<string> => {
      const { file, canvasId } = options

      // Validate file is an image
      if (!file.type.startsWith('image/')) {
        showToast('File must be an image', 'error')
        throw new Error('File must be an image')
      }

      // Validate size
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        showToast('Image must be less than 5MB', 'error')
        throw new Error('Image must be less than 5MB')
      }

      // Find the target canvas
      const targetCanvas = findTargetCanvas(store.root, canvasId)
      if (!targetCanvas) {
        showToast('No canvas found', 'error')
        throw new Error('No canvas found')
      }

      // Generate filename with extension
      const extension = file.name.split('.').pop() || 'png'
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'image'
      const uniqueBaseName = getUniqueNameForNewNode(targetCanvas, baseName, {
        type: 'image',
        mimeType: file.type,
      })
      const filename = `${uniqueBaseName}.${extension}`

      // Get image dimensions before upload (while we have the File)
      const dimensions = await getImageDimensions(file)

      // Compute content hash for cache invalidation
      const contentHash = await computeFileHash(file)

      // Upload file via mutation
      const uploadResult = await uploadImage.mutateAsync({
        file,
        workspaceId,
        canvasId: targetCanvas.id,
        filename,
      })

      // Use provided position or calculate using shared utility
      const nodeItems = targetCanvas.items.filter((i) => i.kind === 'node')
      const position =
        options.position ??
        calculateItemPosition(nodeItems, { direction: 'horizontal', defaultSize: IMAGE_NODE_LAYOUT.WIDTH })

      // Create the image node with natural dimensions
      const nodeId = crypto.randomUUID()
      const displaySize = calculateImageDisplaySize(dimensions.width, dimensions.height)
      const imageData: ImageNodeData = {
        storagePath: uploadResult.storagePath,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        width: dimensions.width,
        height: dimensions.height,
        contentHash,
      }

      const nowIso = new Date().toISOString()
      const newNodeItem: NodeItem = {
        id: nodeId,
        name: uniqueBaseName,
        kind: 'node' as const,
        collapsed: false as const,
        xynode: {
          id: nodeId,
          type: 'image' as const,
          position,
          data: imageData,
          width: displaySize.width,
          height: displaySize.height,
          measured: { ...displaySize },
        },
      }

      appendNodeWithCreateAudit(targetCanvas, newNodeItem, auditActor, nowIso)

      return nodeId
    },
    [store, workspaceId, uploadImage, auditActor]
  )
}

// Add a file node to a canvas (non-image binary files)
export const useAddFileNode = () => {
  const { store, workspaceId } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const uploadImage = useUploadImage() // Reuse same upload hook - backend accepts all file types
  const auditActor = createUserAuditActor(user?.id)

  return useCallback(
    async (options: { file: File; canvasId?: string; position?: { x: number; y: number } }): Promise<string> => {
      const { file, canvasId } = options

      // Validate extension
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!ext || !SUPPORTED_FILE_EXTENSIONS.includes(ext as SupportedFileExtension)) {
        showToast(`Unsupported file type: .${ext}`, 'error')
        throw new Error(`Unsupported file type: .${ext}`)
      }

      // Validate size (use same limit as images: 5MB)
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        showToast('File must be less than 5MB', 'error')
        throw new Error('File must be less than 5MB')
      }

      // Find target canvas
      const targetCanvas = findTargetCanvas(store.root, canvasId)
      if (!targetCanvas) {
        showToast('No canvas found', 'error')
        throw new Error('No canvas found')
      }

      const uniqueBaseName = getUniqueNameForNewNode(targetCanvas, file.name.replace(/\.[^/.]+$/, ''), {
        type: 'file',
        originalFilename: file.name,
      })
      const extension = file.name.match(/\.[^/.]+$/)?.[0] || ''
      const filename = `${uniqueBaseName}${extension}`

      // Compute content hash for cache invalidation
      const contentHash = await computeFileHash(file)

      // Upload file (reuses image upload endpoint - it accepts any file)
      const uploadResult = await uploadImage.mutateAsync({
        file,
        workspaceId,
        canvasId: targetCanvas.id,
        filename,
      })

      // Use provided position or calculate using shared utility
      const nodeItems = targetCanvas.items.filter((i) => i.kind === 'node')
      const position =
        options.position ??
        calculateItemPosition(nodeItems, { direction: 'horizontal', defaultSize: FILE_NODE_LAYOUT.WIDTH })

      // Create file node
      const nodeId = crypto.randomUUID()
      const fileData: FileNodeData = {
        storagePath: uploadResult.storagePath,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        originalFilename: filename,
        contentHash,
      }

      const nowIso = new Date().toISOString()
      const newNodeItem: NodeItem = {
        id: nodeId,
        name: uniqueBaseName,
        kind: 'node' as const,
        collapsed: false as const,
        xynode: {
          id: nodeId,
          type: 'file' as const,
          position,
          data: fileData,
          initialWidth: FILE_NODE_LAYOUT.DEFAULT_MEASURED.width,
          initialHeight: FILE_NODE_LAYOUT.DEFAULT_MEASURED.height,
        },
      }

      appendNodeWithCreateAudit(targetCanvas, newNodeItem, auditActor, nowIso)

      return nodeId
    },
    [store, workspaceId, uploadImage, auditActor]
  )
}

// Add an audio node to a canvas
export const useAddAudioNode = () => {
  const { store, workspaceId } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const uploadImage = useUploadImage() // Reuse same upload hook - backend accepts all file types
  const auditActor = createUserAuditActor(user?.id)

  return useCallback(
    async (options: { file: File; canvasId?: string; position?: { x: number; y: number } }): Promise<string> => {
      const { file, canvasId } = options

      // Validate extension
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!ext || !SUPPORTED_AUDIO_EXTENSIONS.includes(ext as SupportedAudioExtension)) {
        showToast(`Unsupported audio format: .${ext}`, 'error')
        throw new Error(`Unsupported audio format: .${ext}`)
      }

      // Validate size (use same limit as images: 5MB)
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        showToast('Audio file must be less than 5MB', 'error')
        throw new Error('Audio file must be less than 5MB')
      }

      // Find target canvas
      const targetCanvas = findTargetCanvas(store.root, canvasId)
      if (!targetCanvas) {
        showToast('No canvas found', 'error')
        throw new Error('No canvas found')
      }

      const uniqueBaseName = getUniqueNameForNewNode(targetCanvas, file.name.replace(/\.[^/.]+$/, ''), {
        type: 'audio',
        originalFilename: file.name,
      })
      const extension = file.name.match(/\.[^/.]+$/)?.[0] || ''
      const filename = `${uniqueBaseName}${extension}`

      // Compute content hash for cache invalidation
      const contentHash = await computeFileHash(file)

      // Upload file (reuses image upload endpoint - it accepts any file)
      const uploadResult = await uploadImage.mutateAsync({
        file,
        workspaceId,
        canvasId: targetCanvas.id,
        filename,
      })

      // Use provided position or calculate using shared utility
      const nodeItems = targetCanvas.items.filter((i) => i.kind === 'node')
      const position =
        options.position ??
        calculateItemPosition(nodeItems, { direction: 'horizontal', defaultSize: AUDIO_NODE_LAYOUT.WIDTH })

      // Create audio node
      const nodeId = crypto.randomUUID()
      const audioData: AudioNodeData = {
        storagePath: uploadResult.storagePath,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        originalFilename: filename,
        contentHash,
      }

      const nowIso = new Date().toISOString()
      const newNodeItem: NodeItem = {
        id: nodeId,
        name: uniqueBaseName,
        kind: 'node' as const,
        collapsed: false as const,
        xynode: {
          id: nodeId,
          type: 'audio' as const,
          position,
          data: audioData,
          initialWidth: AUDIO_NODE_LAYOUT.DEFAULT_MEASURED.width,
          initialHeight: AUDIO_NODE_LAYOUT.DEFAULT_MEASURED.height,
        },
      }

      appendNodeWithCreateAudit(targetCanvas, newNodeItem, auditActor, nowIso)

      return nodeId
    },
    [store, workspaceId, uploadImage, auditActor]
  )
}

// Add a link node to a canvas
export const useAddLinkNode = () => {
  const { store } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const auditActor = createUserAuditActor(user?.id)

  return useCallback(
    (options: { url: string; canvasId?: string; position?: { x: number; y: number } }): string | null => {
      const { url, canvasId } = options
      const autoEmbed = getAutoEmbed(url)
      const initialNodeWidth = autoEmbed?.definition.width ?? LINK_NODE_LAYOUT.WIDTH
      const initialNodeHeight = autoEmbed ? autoEmbed.definition.height + NODE_NAME_HEIGHT : LINK_NODE_LAYOUT.HEIGHT

      // Validate URL
      if (!isSafeExternalUrl(url)) {
        showToast('Invalid URL', 'error')
        return null
      }

      // Find target canvas
      const targetCanvas = findTargetCanvas(store.root, canvasId)
      if (!targetCanvas) {
        showToast('No canvas found', 'error')
        return null
      }

      // Use provided position or calculate using shared utility
      const nodeItems = targetCanvas.items.filter((i) => i.kind === 'node')
      const position =
        options.position ?? calculateItemPosition(nodeItems, { direction: 'horizontal', defaultSize: initialNodeWidth })

      // Extract hostname for node name
      let hostname = url
      try {
        hostname = new URL(url).hostname
      } catch {
        // Keep url as name if parsing fails
      }

      // Create link node
      const nodeId = crypto.randomUUID()
      const nodeName = getUniqueNameForNewNode(targetCanvas, hostname, { type: 'link' })
      const linkData: LinkNodeData = {
        url,
        loadingStatus: 'pending',
        ...(autoEmbed ? { displayMode: 'iframe' as const } : {}),
      }

      const nowIso = new Date().toISOString()
      const newNodeItem: NodeItem = {
        id: nodeId,
        name: nodeName,
        kind: 'node' as const,
        collapsed: false as const,
        xynode: {
          id: nodeId,
          type: 'link' as const,
          position,
          data: linkData,
          ...(autoEmbed
            ? {
                width: initialNodeWidth,
                height: initialNodeHeight,
                initialWidth: initialNodeWidth,
                initialHeight: initialNodeHeight,
              }
            : {
                initialWidth: LINK_NODE_LAYOUT.DEFAULT_MEASURED.width,
                initialHeight: LINK_NODE_LAYOUT.DEFAULT_MEASURED.height,
              }),
        },
      }

      appendNodeWithCreateAudit(targetCanvas, newNodeItem, auditActor, nowIso)

      return nodeId
    },
    [store, auditActor]
  )
}

export const useAddTextNode = () => {
  const { store } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const auditActor = createUserAuditActor(user?.id)

  return useCallback(
    (options: { content?: string; canvasId?: string; position?: { x: number; y: number } }): string | null => {
      const { canvasId } = options

      const targetCanvas = findTargetCanvas(store.root, canvasId)
      if (!targetCanvas) {
        showToast('No canvas found', 'error')
        return null
      }

      const nodeItems = targetCanvas.items.filter((i) => i.kind === 'node')
      const position =
        options.position ??
        calculateItemPosition(nodeItems, { direction: 'horizontal', defaultSize: TEXT_NODE_LAYOUT.WIDTH })

      const nodeId = crypto.randomUUID()
      const nodeName = getUniqueNameForNewNode(targetCanvas, 'text', { type: 'text' })
      const textData: TextNodeData = {
        content: options.content || 'Text',
      }

      const nowIso = new Date().toISOString()
      const newNodeItem: NodeItem = {
        id: nodeId,
        name: nodeName,
        kind: 'node' as const,
        collapsed: false as const,
        xynode: {
          id: nodeId,
          type: 'text' as const,
          position,
          data: textData,
          initialWidth: TEXT_NODE_LAYOUT.DEFAULT_MEASURED.width,
          initialHeight: TEXT_NODE_LAYOUT.DEFAULT_MEASURED.height,
        },
      }

      appendNodeWithCreateAudit(targetCanvas, newNodeItem, auditActor, nowIso)
      return nodeId
    },
    [store, auditActor]
  )
}

export const useAddStickyNote = () => {
  const { store, yDoc, workspaceUndoController } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const auditActor = createUserAuditActor(user?.id)

  return useCallback(
    (options: {
      content?: string
      color?: StickyNoteNodeData['color']
      canvasId?: string
      position?: { x: number; y: number }
    }): string | null => {
      const { canvasId } = options

      const targetCanvas = findTargetCanvas(store.root, canvasId)
      if (!targetCanvas) {
        showToast('No canvas found', 'error')
        return null
      }

      const nodeItems = targetCanvas.items.filter((i) => i.kind === 'node')
      const position =
        options.position ??
        calculateItemPosition(nodeItems, { direction: 'horizontal', defaultSize: STICKY_NOTE_NODE_LAYOUT.WIDTH })

      const nodeId = crypto.randomUUID()
      const nodeName = getUniqueNameForNewNode(targetCanvas, 'sticky-note', { type: 'stickyNote' })
      const stickyData: StickyNoteNodeData = {}
      if (options.color) stickyData.color = options.color

      const nowIso = new Date().toISOString()
      const newNodeItem: NodeItem = {
        id: nodeId,
        name: nodeName,
        kind: 'node' as const,
        collapsed: false as const,
        xynode: {
          id: nodeId,
          type: 'stickyNote' as const,
          position,
          data: stickyData,
          initialWidth: STICKY_NOTE_NODE_LAYOUT.DEFAULT_MEASURED.width,
          initialHeight: STICKY_NOTE_NODE_LAYOUT.DEFAULT_MEASURED.height,
        },
      }

      workspaceUndoController.runCommand(() => {
        createNoteDocForNode(yDoc, nodeId, newNodeItem.xynode.type)
        appendNodeWithCreateAudit(targetCanvas, newNodeItem, auditActor, nowIso)
      })
      return nodeId
    },
    [store, yDoc, workspaceUndoController, auditActor]
  )
}

export const useUpdateDocumentName = () => {
  const { store } = useContext(WorkspaceContext)!

  return useCallback(
    (nodeId: string, newName: string) => {
      // Find and update the node in the valtio store - valtio will handle Yjs sync
      const updateNodeInCanvas = (canvas: CanvasItem): boolean => {
        // Search in this canvas's items
        const item = canvas.items.find((i) => i.id === nodeId)
        if (item) {
          if (item.kind !== 'node') {
            return false
          }

          const uniqueName = getUniqueNameForExistingNode(store.root!, nodeId, newName)
          if (!uniqueName) {
            return false
          }

          item.name = uniqueName
          return true
        }

        // Search child canvases in items
        for (const item of canvas.items) {
          if (item.kind === 'canvas' && updateNodeInCanvas(item)) return true
        }
        return false
      }

      if (store.root) {
        updateNodeInCanvas(store.root)
      }
    },
    [store]
  )
}

// Create a new canvas
export const useCreateCanvas = () => {
  const { store } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const auditActor = createUserAuditActor(user?.id)

  return useCallback(
    (parentCanvasId?: string) => {
      if (!store.root) {
        console.warn('[useCreateCanvas] No root canvas exists')
        return ''
      }

      const parentCanvas = findTargetCanvas(store.root, parentCanvasId) ?? store.root

      // Calculate vertical position below ALL existing items (nodes + canvases)
      // to avoid overlapping document nodes
      const position = calculateItemPosition(parentCanvas.items, {
        direction: 'vertical',
        defaultSize: CANVAS_NODE_LAYOUT.HEIGHT,
      })

      const canvasId = crypto.randomUUID()
      const nowIso = new Date().toISOString()
      const canvasName = getUniqueSiblingName({
        siblings: parentCanvas.items,
        preferredName: 'New Canvas',
        target: { kind: 'canvas' },
      })
      const newCanvas: CanvasItem = {
        id: canvasId,
        name: canvasName,
        kind: 'canvas',
        xynode: {
          id: canvasId,
          type: 'canvas',
          position,
          data: {},
        },
        edges: [],
        items: [],
      }

      appendCanvasWithCreateAudit(parentCanvas, newCanvas, auditActor, nowIso)

      return newCanvas.id
    },
    [store, auditActor]
  )
}

// Rename any tree item (canvas)
export const useRenameTreeItem = () => {
  const { store } = useContext(WorkspaceContext)!

  return useCallback(
    (itemId: string, newName: string) => {
      if (store.root) {
        if (store.root.id === itemId) {
          store.root.name = newName.trim()
          return
        }

        const parentCanvas = findCanvasParent(store.root, itemId)
        const canvasToRename = parentCanvas?.items.find((item) => item.kind === 'canvas' && item.id === itemId)
        if (!parentCanvas || !canvasToRename || canvasToRename.kind !== 'canvas') {
          return
        }

        if (isReservedTopLevelCanvas(store.root, canvasToRename)) {
          showToast('This folder cannot be renamed', 'info')
          return
        }

        canvasToRename.name = getUniqueSiblingName({
          siblings: parentCanvas.items,
          preferredName: newName,
          excludeItemId: itemId,
          target: { kind: 'canvas' },
        })
      }
    },
    [store]
  )
}

// Delete a tree item (canvas)
export const useDeleteTreeItem = () => {
  const { store, yDoc, workspaceUndoController } = useContext(WorkspaceContext)!

  return useCallback(
    (itemId: string) => {
      if (!store.root) {
        return
      }

      if (store.root?.id === itemId) {
        console.warn('[useDeleteTreeItem] Cannot delete root canvas')
        return
      }

      const canonicalKanwasNodeId = findCanonicalKanwasNodeId(store.root)

      const findAndDelete = (canvas: CanvasItem): boolean => {
        const index = canvas.items.findIndex((item) => item.kind === 'canvas' && item.id === itemId)
        if (index !== -1) {
          const candidate = canvas.items[index]
          if (candidate.kind === 'canvas' && isReservedTopLevelCanvas(store.root, candidate)) {
            showToast('This folder cannot be deleted', 'info')
            return true
          }

          if (
            candidate.kind === 'canvas' &&
            canonicalKanwasNodeId !== null &&
            canvasContainsNodeId(candidate, canonicalKanwasNodeId)
          ) {
            showToast('Cannot delete a canvas that contains the instructions document', 'info')
            return true
          }

          workspaceUndoController.runCommand(() => {
            rememberDeletedNoteDocsForRemovedItems(yDoc, [candidate], (noteId, noteDoc) => {
              workspaceUndoController.rememberDeletedNoteDoc(noteId, noteDoc)
            })
            deleteNoteDocsForRemovedItems(yDoc, [candidate])
            deleteCanvasItemsFromCanvas(canvas, [candidate.id])
          })
          return true
        }

        for (const item of canvas.items) {
          if (item.kind === 'canvas' && findAndDelete(item)) return true
        }
        return false
      }

      findAndDelete(store.root)
    },
    [store, yDoc, workspaceUndoController]
  )
}

// Delete a node from a canvas
export const useDeleteNode = () => {
  const { store, yDoc, workspaceUndoController } = useContext(WorkspaceContext)!

  return useCallback(
    (nodeId: string, canvasId: string) => {
      const canonicalKanwasNodeId = store.root ? findCanonicalKanwasNodeId(store.root) : null

      const findAndDeleteNode = (canvas: CanvasItem): boolean => {
        if (canvas.id === canvasId) {
          const index = canvas.items.findIndex((i) => i.kind === 'node' && i.id === nodeId)
          if (index !== -1) {
            const nodeToDelete = canvas.items[index]
            if (
              nodeToDelete.kind === 'node' &&
              canonicalKanwasNodeId !== null &&
              nodeToDelete.id === canonicalKanwasNodeId
            ) {
              showToast('Instructions document cannot be deleted', 'info')
              return true
            }

            if (nodeToDelete.kind === 'node') {
              workspaceUndoController.runCommand(() => {
                rememberDeletedNoteDocsForRemovedItems(yDoc, [nodeToDelete], (noteId, noteDoc) => {
                  workspaceUndoController.rememberDeletedNoteDoc(noteId, noteDoc)
                })
                deleteNoteDocsForRemovedItems(yDoc, [nodeToDelete])
                deleteCanvasItemsFromCanvas(canvas, [nodeToDelete.id])
              })
            }
            return true
          }
        }
        // Search child canvases in items
        for (const item of canvas.items) {
          if (item.kind === 'canvas' && findAndDeleteNode(item)) return true
        }
        return false
      }

      if (store.root) {
        findAndDeleteNode(store.root)
      }
    },
    [store, yDoc, workspaceUndoController]
  )
}

// Fetch link metadata and update node data
export const useFetchLinkMetadata = () => {
  const { store } = useContext(WorkspaceContext)!
  const { user } = useAuthState()
  const auditActor = createUserAuditActor(user?.id)

  return useMutation({
    mutationFn: async (params: { nodeId: string; url: string; workspaceId: string; canvasId: string }) => {
      const response = await tuyau['link-metadata'].$post({
        url: params.url,
        workspaceId: params.workspaceId,
        canvasId: params.canvasId,
      })
      if (response.error) {
        throw new Error('Failed to fetch metadata')
      }
      return { ...response.data, nodeId: params.nodeId }
    },
    onSuccess: (metadata, params) => {
      if (!store.root) return

      const located = findNodeById(store.root, params.nodeId)
      if (!located || located.node.xynode.type !== 'link') return
      const nodeItem = located.node

      // Update node data (Valtio syncs to Yjs)
      const nodeData = nodeItem.xynode.data as LinkNodeData
      nodeData.title = metadata.title
      nodeData.description = metadata.description
      nodeData.siteName = metadata.siteName
      nodeData.imageStoragePath = metadata.imageStoragePath
      nodeData.loadingStatus = 'loaded'

      touchNodeAndOwnerCanvasAudit(store.root, metadata.nodeId, auditActor, new Date().toISOString())
    },
    onError: (_error, params) => {
      if (!store.root) return

      const located = findNodeById(store.root, params.nodeId)
      if (!located || located.node.xynode.type !== 'link') return
      const nodeItem = located.node

      const nodeData = nodeItem.xynode.data as LinkNodeData
      nodeData.loadingStatus = 'error'

      touchNodeAndOwnerCanvasAudit(store.root, params.nodeId, auditActor, new Date().toISOString())
    },
  })
}
