import { useState, useRef, useEffect, useCallback, useContext } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { CanvasItem } from 'shared'
import { SUPPORTED_FILE_EXTENSIONS, SUPPORTED_AUDIO_EXTENSIONS } from 'shared/constants'
import { SUPPORTED_IMAGE_TYPES } from './constants'
import {
  useAddNode,
  useFitNodeInView,
  useFocusNode,
  useAddImageNode,
  useAddFileNode,
  useAddAudioNode,
  useAddLinkNode,
  useAddTextNode,
  useAddStickyNote,
} from './hooks'
import { showToast } from '@/utils/toast'
import type { ToolKind, FlowPosition } from './addNodeToolbar'
import { DRAG_THRESHOLD_PX } from './addNodeToolbar'
import { WorkspaceContext } from '@/providers/workspace/WorkspaceContext'
import { buildSectionLayouts, getSectionBounds, getSectionDropZoneBounds } from './section/layout'
import { useCreateEmptySection } from './section'
import { moveItemToSection } from './section/sectionUtils'
import { findSectionMemberItem } from './section/sectionMembers'

interface PendingPlacement {
  position: FlowPosition | null
  sectionId: string | null
}

function isPointInsideBounds(
  bounds: { left: number; top: number; right: number; bottom: number } | null,
  x: number,
  y: number
): boolean {
  if (!bounds) {
    return false
  }

  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
}

function getReactFlowNodeElement(target: HTMLElement | null): HTMLElement | null {
  return target?.closest('.react-flow__node') ?? null
}

export function isSectionBackgroundPlacementSurface(target: HTMLElement | null, canvas: CanvasItem): boolean {
  const nodeElement = getReactFlowNodeElement(target)
  if (!nodeElement) {
    return false
  }

  const nodeId = nodeElement.getAttribute('data-id')
  if (!nodeId) {
    return false
  }

  return (canvas.sections ?? []).some((section) => section.id === nodeId)
}

export function shouldBlockToolbarPlacementTarget(target: HTMLElement | null, canvas: CanvasItem): boolean {
  if (!target) {
    return false
  }

  if (target.closest('.react-flow__edge')) {
    return true
  }

  const nodeElement = getReactFlowNodeElement(target)
  if (!nodeElement) {
    return false
  }

  return !isSectionBackgroundPlacementSurface(target, canvas)
}

export function findToolbarPlacementSection(canvas: CanvasItem, position: FlowPosition) {
  const sectionLayouts = buildSectionLayouts(canvas)

  for (const section of canvas.sections ?? []) {
    if (isPointInsideBounds(getSectionBounds(section, sectionLayouts.get(section.id)), position.x, position.y)) {
      return section
    }
  }

  for (const section of canvas.sections ?? []) {
    if (
      isPointInsideBounds(getSectionDropZoneBounds(section, sectionLayouts.get(section.id)), position.x, position.y)
    ) {
      return section
    }
  }

  return null
}

export function useToolbarPlacement(canvas: CanvasItem, onSectionContentChange?: (sectionId: string) => void) {
  const [armedTool, setArmedTool] = useState<ToolKind | null>(null)
  const [draggingTool, setDraggingTool] = useState<ToolKind | null>(null)
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null)
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [isMoreOpen, setIsMoreOpen] = useState(false)

  const moreMenuRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const pendingPlacementRef = useRef<PendingPlacement | null>(null)
  const suppressNextClickRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const genericFileInputRef = useRef<HTMLInputElement>(null)
  const audioFileInputRef = useRef<HTMLInputElement>(null)

  const { workspaceUndoController } = useContext(WorkspaceContext)!
  const { screenToFlowPosition } = useReactFlow()

  const addNode = useAddNode()
  const addImageNode = useAddImageNode()
  const addFileNode = useAddFileNode()
  const addAudioNode = useAddAudioNode()
  const addLinkNode = useAddLinkNode()
  const addTextNode = useAddTextNode()
  const addStickyNote = useAddStickyNote()
  const fitNodeInView = useFitNodeInView()
  const focusNode = useFocusNode()
  const createEmptySection = useCreateEmptySection(canvas)

  const disarm = useCallback(() => {
    setArmedTool(null)
    setDraggingTool(null)
    setHoveredSectionId(null)
    pendingPlacementRef.current = null
  }, [])

  const updateHoveredSectionFromClientPoint = useCallback(
    (clientX: number, clientY: number, target: HTMLElement | null) => {
      if (!target || shouldBlockToolbarPlacementTarget(target, canvas) || !target.closest('.react-flow__pane')) {
        setHoveredSectionId(null)
        return
      }

      const position = screenToFlowPosition({ x: clientX, y: clientY })
      setHoveredSectionId(findToolbarPlacementSection(canvas, position)?.id ?? null)
    },
    [canvas, screenToFlowPosition]
  )

  const attachCreatedItemToSection = useCallback(
    (itemId: string, sectionId: string | null) => {
      if (!sectionId) {
        return
      }

      const targetSection = canvas.sections?.find((section) => section.id === sectionId)
      const item = findSectionMemberItem(canvas, itemId)
      if (!targetSection || !item) {
        return
      }

      workspaceUndoController.runCommand(() => {
        moveItemToSection(canvas, item, targetSection, targetSection.memberIds.length)
        onSectionContentChange?.(targetSection.id)
      })
    },
    [canvas, onSectionContentChange, workspaceUndoController]
  )

  const spawnAt = useCallback(
    (kind: ToolKind, position: FlowPosition | null) => {
      const sectionId = position ? (findToolbarPlacementSection(canvas, position)?.id ?? null) : null
      const posOpt = position ? { position } : {}
      switch (kind) {
        case 'document': {
          const id = addNode({ canvasId: canvas.id, ...posOpt })
          if (!id) {
            showToast('Failed to create document', 'error')
            return
          }
          attachCreatedItemToSection(id, sectionId)
          if (!position) {
            setTimeout(() => {
              fitNodeInView(id)
              focusNode(id)
            }, 100)
          }
          break
        }
        case 'text': {
          const id = addTextNode({ canvasId: canvas.id, ...posOpt })
          if (id) {
            attachCreatedItemToSection(id, sectionId)
          }
          if (id && !position) setTimeout(() => fitNodeInView(id), 100)
          break
        }
        case 'sticky': {
          const id = addStickyNote({ canvasId: canvas.id, ...posOpt })
          if (id) {
            attachCreatedItemToSection(id, sectionId)
          }
          if (id && !position) setTimeout(() => fitNodeInView(id), 100)
          break
        }
        case 'image': {
          pendingPlacementRef.current = { position, sectionId }
          fileInputRef.current?.click()
          break
        }
        case 'file': {
          pendingPlacementRef.current = { position, sectionId }
          genericFileInputRef.current?.click()
          break
        }
        case 'audio': {
          pendingPlacementRef.current = { position, sectionId }
          audioFileInputRef.current?.click()
          break
        }
        case 'link': {
          pendingPlacementRef.current = { position, sectionId }
          setIsLinkModalOpen(true)
          break
        }
        case 'section': {
          if (!position) {
            return
          }

          const sectionId = workspaceUndoController.runCommand(() => createEmptySection(position))
          if (sectionId) {
            setTimeout(() => fitNodeInView(sectionId), 100)
          }
          break
        }
      }
    },
    [
      addNode,
      addTextNode,
      addStickyNote,
      canvas,
      fitNodeInView,
      focusNode,
      attachCreatedItemToSection,
      createEmptySection,
      workspaceUndoController,
    ]
  )

  const handleToolClick = (kind: ToolKind) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    setArmedTool((prev) => (prev === kind ? null : kind))
  }

  const handleToolDoubleClick = (kind: ToolKind) => {
    setArmedTool(null)
    spawnAt(kind, null)
  }

  const handleToolMouseDown = (e: React.MouseEvent, kind: ToolKind) => {
    if (e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    let active = false

    const onMove = (ev: MouseEvent) => {
      if (!active) {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          active = true
          suppressNextClickRef.current = true
          setArmedTool(null)
          setDraggingTool(kind)
        }
      }
      if (active && cursorRef.current) {
        cursorRef.current.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`
        updateHoveredSectionFromClientPoint(
          ev.clientX,
          ev.clientY,
          document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
        )
      }
    }

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!active) return
      setDraggingTool(null)
      setHoveredSectionId(null)
      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      if (!target) return
      if (shouldBlockToolbarPlacementTarget(target, canvas)) return
      if (!target.closest('.react-flow__pane')) return
      const pos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      spawnAt(kind, pos)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Close more menu on click outside
  useEffect(() => {
    if (!isMoreOpen) return
    const onClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [isMoreOpen])

  // Esc disarms
  useEffect(() => {
    if (!armedTool && !isMoreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        disarm()
        setIsMoreOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [armedTool, isMoreOpen, disarm])

  // While armed: follow cursor + intercept canvas clicks to place nodes
  useEffect(() => {
    if (!armedTool) return

    const onMove = (e: MouseEvent) => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
      }
      updateHoveredSectionFromClientPoint(
        e.clientX,
        e.clientY,
        document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      )
    }

    const onPointerDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement | null
      if (!target) return
      if (toolbarRef.current && toolbarRef.current.contains(target)) return
      if (shouldBlockToolbarPlacementTarget(target, canvas)) {
        disarm()
        return
      }
      if (
        target.closest('.react-flow__controls') ||
        target.closest('.react-flow__minimap') ||
        target.closest('.react-flow__panel')
      ) {
        return
      }
      if (!target.closest('.react-flow__pane')) {
        disarm()
        return
      }
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      e.preventDefault()
      e.stopPropagation()
      spawnAt(armedTool, pos)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onPointerDown, true)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onPointerDown, true)
    }
  }, [armedTool, canvas, disarm, screenToFlowPosition, spawnAt, updateHoveredSectionFromClientPoint])

  // Hide native cursor everywhere while armed or dragging
  useEffect(() => {
    if (!armedTool && !draggingTool) return
    document.documentElement.style.cursor = 'none'
    document.body.style.cursor = 'none'
    const style = document.createElement('style')
    style.textContent = '* { cursor: none !important; }'
    document.head.appendChild(style)
    return () => {
      document.documentElement.style.cursor = ''
      document.body.style.cursor = ''
      style.remove()
    }
  }, [armedTool, draggingTool])

  useEffect(() => {
    if (armedTool || draggingTool) {
      return
    }

    setHoveredSectionId(null)
  }, [armedTool, draggingTool])

  // File input handlers
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const pendingPlacement = pendingPlacementRef.current
    pendingPlacementRef.current = null
    const position = pendingPlacement?.position ?? null
    try {
      const nodeId = await addImageNode({ file, canvasId: canvas.id, ...(position ? { position } : {}) })
      attachCreatedItemToSection(nodeId, pendingPlacement?.sectionId ?? null)
      if (!position) setTimeout(() => fitNodeInView(nodeId), 100)
    } catch {
      // error toast shown by hook
    }
  }

  const handleGenericFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const pendingPlacement = pendingPlacementRef.current
    pendingPlacementRef.current = null
    const position = pendingPlacement?.position ?? null
    try {
      const nodeId = await addFileNode({ file, canvasId: canvas.id, ...(position ? { position } : {}) })
      attachCreatedItemToSection(nodeId, pendingPlacement?.sectionId ?? null)
      if (!position) setTimeout(() => fitNodeInView(nodeId), 100)
    } catch {
      // error toast shown by hook
    }
  }

  const handleAudioFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const pendingPlacement = pendingPlacementRef.current
    pendingPlacementRef.current = null
    const position = pendingPlacement?.position ?? null
    try {
      const nodeId = await addAudioNode({ file, canvasId: canvas.id, ...(position ? { position } : {}) })
      attachCreatedItemToSection(nodeId, pendingPlacement?.sectionId ?? null)
      if (!position) setTimeout(() => fitNodeInView(nodeId), 100)
    } catch {
      // error toast shown by hook
    }
  }

  const handleLinkSubmit = (url: string) => {
    const pendingPlacement = pendingPlacementRef.current
    pendingPlacementRef.current = null
    const position = pendingPlacement?.position ?? null
    const id = addLinkNode({ url, canvasId: canvas.id, ...(position ? { position } : {}) })
    if (id) {
      attachCreatedItemToSection(id, pendingPlacement?.sectionId ?? null)
    }
    if (id && !position) setTimeout(() => fitNodeInView(id), 100)
  }

  const handleLinkModalClose = () => {
    setIsLinkModalOpen(false)
    pendingPlacementRef.current = null
  }

  return {
    armedTool,
    draggingTool,
    hoveredSectionId,
    isMoreOpen,
    isLinkModalOpen,
    setIsMoreOpen,
    showGhostCursor: !!(draggingTool ?? armedTool),

    // Refs (attached by the component)
    cursorRef,
    toolbarRef,
    moreMenuRef,
    fileInputRef,
    genericFileInputRef,
    audioFileInputRef,

    // Handlers
    handleToolClick,
    handleToolDoubleClick,
    handleToolMouseDown,
    handleImageFileChange,
    handleGenericFileChange,
    handleAudioFileChange,
    handleLinkSubmit,
    handleLinkModalClose,

    // File accept types (for input elements)
    imageAccept: SUPPORTED_IMAGE_TYPES.join(','),
    fileAccept: SUPPORTED_FILE_EXTENSIONS.map((ext: string) => `.${ext}`).join(','),
    audioAccept: SUPPORTED_AUDIO_EXTENSIONS.map((ext: string) => `.${ext}`).join(','),
  }
}
