import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { useCommandHistory } from './useCommandHistory'
import { ResizeHandle } from '@/components/ui/ResizeHandle/ResizeHandle'
import { useResize } from '@/components/ui/ResizeHandle/useResize'
import { FilePreviewList } from './FilePreviewList'
import { useSnapshot } from 'valtio'
import { createMentionExtension } from './mention-extension'
import { createSlashCommandExtension } from './slash-command-extension'
import { slashCommands, type SlashCommand } from './commands'
import { useMentionItems } from './useMentionItems'
import { serializeEditor } from './serialize-editor'
import type { SerializedMention } from './serialize-editor'
import { useWorkspace, useTextSelection } from '@/providers/workspace'
import { useInterruptAgent, useStartNewTask } from '@/providers/chat/hooks'
import { useKeyboardShortcut } from '@/providers/keyboard'
import { useSkills } from '@/hooks/useSkillsApi'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { VoiceWaveform } from './VoiceWaveform'
import { VoiceInputTip } from './ContextualTip'
import { AgentModeSelector } from './AgentModeSelector'
import type { CanvasItem, NodeItem } from 'shared'
import type { TextSelection } from '@/providers/workspace'
import './chat-editor.css'

interface ChatInputProps {
  workspaceId: string
  onSubmit: (message: string, files: File[], mentions: SerializedMention[], textSelection: TextSelection | null) => void
  isProcessing: boolean
  hasPendingQuestion?: boolean
  files: File[]
  onFilesChange: (files: File[]) => void
  selectedNodeIds: string[]
  onDeselectNode?: (nodeId: string) => void
  showVoiceTip?: boolean
  onDismissVoiceTip?: () => void
  showDirectModeTip?: boolean
  onDismissDirectModeTip?: () => void
  editSession?: {
    id: string
    label: string
    message: string
    mentions?: SerializedMention[]
  } | null
  onCancelEdit?: () => void
}

const MIN_HEIGHT = 140
const MAX_AUTO_HEIGHT = 400
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_FILES = 10

const ACCEPTED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/x-icon',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/x-flv',
  'video/x-ms-wmv',
  'video/x-m4v',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
  'audio/x-ms-wma',
  'audio/opus',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/xml',
  'text/xml',
  'text/csv',
  'application/x-yaml',
  'text/yaml',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/typescript',
  'application/rtf',
  'application/epub+zip',
  'application/x-mobipocket-ebook',
]

function hasActiveSuggestion(state: EditorState) {
  return state.plugins.some((plugin) => {
    const pluginState = plugin.getState(state)
    return pluginState?.active === true
  })
}

function isMentionBoundary(character: string | undefined) {
  return !character || /\s|[.,!?;:)}\]>'"]/.test(character)
}

function buildEditorInlineContent(line: string, mentions: SerializedMention[]): JSONContent[] | undefined {
  if (line.length === 0) {
    return undefined
  }

  const availableMentions = mentions
    .filter((mention) => mention.label.length > 0)
    .sort((left, right) => right.label.length - left.label.length)

  if (availableMentions.length === 0) {
    return [{ type: 'text', text: line }]
  }

  const content: JSONContent[] = []
  let textBuffer = ''
  let cursor = 0

  while (cursor < line.length) {
    if (line[cursor] === '@') {
      const matchingMention = availableMentions.find((mention) => {
        const mentionToken = `@${mention.label}`
        return line.startsWith(mentionToken, cursor) && isMentionBoundary(line[cursor + mentionToken.length])
      })

      if (matchingMention) {
        if (textBuffer) {
          content.push({ type: 'text', text: textBuffer })
          textBuffer = ''
        }

        content.push({
          type: 'mention',
          attrs: {
            id: matchingMention.id,
            label: matchingMention.label,
          },
        })
        cursor += matchingMention.label.length + 1
        continue
      }
    }

    textBuffer += line[cursor]
    cursor += 1
  }

  if (textBuffer) {
    content.push({ type: 'text', text: textBuffer })
  }

  return content.length > 0 ? content : undefined
}

function buildEditorContent(message: string, mentions: SerializedMention[] = []): JSONContent {
  return {
    type: 'doc',
    content: message.split('\n').map((line) => ({
      type: 'paragraph',
      content: buildEditorInlineContent(line, mentions),
    })),
  }
}

export function ChatInput({
  workspaceId,
  onSubmit,
  isProcessing,
  hasPendingQuestion,
  files,
  onFilesChange,
  selectedNodeIds,
  onDeselectNode,
  showVoiceTip,
  onDismissVoiceTip,
  showDirectModeTip,
  onDismissDirectModeTip,
  editSession,
  onCancelEdit,
}: ChatInputProps) {
  // Editor stays editable during processing so user can type ahead
  const isEditorDisabled = !!hasPendingQuestion

  const [inputHeight, setInputHeight] = useState(MIN_HEIGHT)
  const [, setIsManuallyResized] = useState(false)
  const isManuallyResizedRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitHovered, setIsSubmitHovered] = useState(false)
  const [isEditorEmpty, setIsEditorEmpty] = useState(true)
  const [isStopping, setIsStopping] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropContainerRef = useRef<HTMLDivElement>(null)
  const chipsRowRef = useRef<HTMLDivElement>(null)
  const editBannerRef = useRef<HTMLDivElement>(null)
  const filePreviewRowRef = useRef<HTMLDivElement>(null)
  const buttonRowRef = useRef<HTMLDivElement>(null)
  const lastPrefilledEditSessionIdRef = useRef<string | null>(null)
  const interruptAgent = useInterruptAgent()
  const startNewTask = useStartNewTask()

  const scrollComposerToBottom = useCallback(() => {
    const container = dropContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [])

  const scrollCaretIntoView = useCallback(() => {
    const container = dropContainerRef.current
    const view = editorRef.current?.view
    if (!container || !view) return
    try {
      const caret = view.coordsAtPos(view.state.selection.head)
      const rect = container.getBoundingClientRect()
      const padding = 12
      if (caret.bottom > rect.bottom - padding) {
        container.scrollTop += caret.bottom - (rect.bottom - padding)
      } else if (caret.top < rect.top + padding) {
        container.scrollTop -= rect.top + padding - caret.top
      }
    } catch {
      // coordsAtPos can throw if the DOM is not yet in sync
    }
  }, [])

  // Reset stopping state when processing ends
  useEffect(() => {
    if (!isProcessing) {
      setIsStopping(false)
    }
  }, [isProcessing])

  const handleInterrupt = useCallback(async () => {
    if (isStopping || !isProcessing) return
    setIsStopping(true)
    await interruptAgent()
  }, [isStopping, isProcessing, interruptAgent])

  // Ref for handleInterrupt to use in TipTap handleKeyDown without stale closure
  const handleInterruptRef = useRef(handleInterrupt)
  handleInterruptRef.current = handleInterrupt

  // ESC key to interrupt when not in chat input - automatically respects exclusive keyboard mode
  useKeyboardShortcut('Escape', handleInterrupt)

  // Auto-resize helper — measures editor DOM and updates height
  const resizeToFit = useCallback(() => {
    if (isManuallyResizedRef.current || !editorRef.current) return
    let editorEl: HTMLElement

    try {
      editorEl = editorRef.current.view.dom as HTMLElement
    } catch {
      return
    }

    const chipsHeight = chipsRowRef.current?.offsetHeight ?? 0
    const editBannerHeight = editBannerRef.current?.offsetHeight ?? 0
    const filePreviewHeight = filePreviewRowRef.current?.offsetHeight ?? 0
    const buttonHeight = buttonRowRef.current?.offsetHeight ?? 48
    // editor content + top padding + chips row + edit banner + file previews + button row + buffer
    const contentHeight =
      editorEl.scrollHeight + 12 + chipsHeight + editBannerHeight + filePreviewHeight + buttonHeight + 16
    const newHeight = Math.max(MIN_HEIGHT, Math.min(contentHeight, MAX_AUTO_HEIGHT))
    setInputHeight(newHeight)
  }, [])

  // Voice input — uses ref to avoid dependency on editor (defined later)
  const editorRef = useRef<ReturnType<typeof useEditor>>(null)
  const handleTranscript = useCallback(
    (text: string) => {
      if (editorRef.current) {
        editorRef.current.commands.focus('end')
        editorRef.current.commands.insertContent(text)
        // Resize after content insertion (DOM needs a tick to update)
        requestAnimationFrame(resizeToFit)
      }
    },
    [resizeToFit]
  )
  const {
    isRecording,
    isTranscribing,
    isSupported: isVoiceSupported,
    toggleRecording,
    analyserRef,
  } = useVoiceInput({ onTranscript: handleTranscript })

  // Submit is disabled when processing, waiting for question answer, or voice recording is active
  const isSubmitDisabled = isProcessing || !!hasPendingQuestion || isRecording || isTranscribing

  const { store, activeCanvasId } = useWorkspace()
  const workspaceSnapshot = useSnapshot(store)
  const { textSelection, setTextSelection } = useTextSelection()

  const { getItems } = useMentionItems(workspaceSnapshot.root as CanvasItem | null, activeCanvasId)

  // Resolve selected node IDs to names for display (includes text-selected document)
  const selectedNodeNames = useMemo(() => {
    const ids = selectedNodeIds || []
    const idSet = new Set(ids)

    // Also include the text-selected document if not already selected
    if (textSelection && !idSet.has(textSelection.nodeId)) {
      idSet.add(textSelection.nodeId)
    }

    if (idSet.size === 0 || !workspaceSnapshot.root) return []

    const results: { id: string; name: string }[] = []

    function search(canvas: CanvasItem) {
      for (const item of canvas.items) {
        if (item.kind === 'node') {
          const node = item as NodeItem
          if (idSet.has(node.xynode.id)) {
            results.push({ id: node.xynode.id, name: node.name || 'Untitled' })
          }
        } else {
          search(item as CanvasItem)
        }
      }
    }

    search(workspaceSnapshot.root as CanvasItem)
    return results
  }, [selectedNodeIds, workspaceSnapshot.root, textSelection])

  // Fetch skills for slash commands
  const { data: skills } = useSkills()

  // Create skill commands from enabled skills
  const skillCommands = useMemo<SlashCommand[]>(() => {
    if (!skills) return []
    return skills
      .filter((s) => s.enabled)
      .map((skill) => ({
        name: skill.name,
        description: skill.description,
        immediate: false,
        insertText: `/${skill.name} `,
      }))
  }, [skills])

  // Merge built-in commands with skill commands
  const allCommands = useMemo(() => [...slashCommands, ...skillCommands], [skillCommands])

  // Handler to send a message (passed to command context)
  const handleSendMessage = useCallback(
    (message: string) => {
      onSubmit(message, [], [], null)
    },
    [onSubmit]
  )

  // Refs for dynamic values accessed by TipTap extensions (extensions are created once)
  const getItemsRef = useRef(getItems)
  getItemsRef.current = getItems
  const activeCanvasIdRef = useRef(activeCanvasId)
  activeCanvasIdRef.current = activeCanvasId
  const focusInput = useCallback(() => {
    editorRef.current?.commands.focus()
  }, [])
  const commandContextRef = useRef<{
    workspaceId: string
    sendMessage?: (message: string) => void
    startNewTask?: () => void | Promise<void>
    focusInput?: () => void
  }>({
    workspaceId,
    sendMessage: handleSendMessage,
    startNewTask,
    focusInput,
  })
  commandContextRef.current = {
    workspaceId,
    sendMessage: handleSendMessage,
    startNewTask,
    focusInput,
  }
  const allCommandsRef = useRef(allCommands)
  allCommandsRef.current = allCommands
  const submitRef = useRef<() => void>(() => {})

  // Command history - stores plain text values
  const historyValueRef = useRef('')
  const isHistoryNavRef = useRef(false)
  const { addToHistory, navigateUp, navigateDown, resetNavigation, isNavigating } = useCommandHistory({
    workspaceId,
    getCurrentValue: () => historyValueRef.current,
    onValueChange: (value) => {
      isHistoryNavRef.current = true
      historyValueRef.current = value
      // Chain into single transaction to avoid mention dropdown triggering between setContent and cursor move
      editor?.chain().setContent(buildEditorContent(value), { emitUpdate: false }).setTextSelection(1).run()
    },
  })
  const isNavigatingRef = useRef(isNavigating)
  isNavigatingRef.current = isNavigating

  // Custom Enter key extension
  const SubmitOnEnter = useMemo(
    () =>
      Extension.create({
        name: 'submitOnEnter',
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              // Don't submit if ANY suggestion popup is active
              // Check all plugins for active suggestion state
              const hasSuggestionActive = hasActiveSuggestion(this.editor.state)

              if (hasSuggestionActive) {
                return false // Let the suggestion plugin handle Enter
              }

              submitRef.current()
              return true
            },
          }
        },
      }),
    []
  )

  const mentionExtension = useMemo(() => createMentionExtension(getItemsRef, activeCanvasIdRef), [])

  const slashCommandExtension = useMemo(() => createSlashCommandExtension(allCommandsRef, commandContextRef), [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: 'So... what are we going to do next?',
      }),
      mentionExtension,
      slashCommandExtension,
      SubmitOnEnter,
    ],
    editorProps: {
      attributes: {
        class: 'prose-none',
      },
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData
        if (!clipboardData) return false

        // Handle image pastes
        const imageFiles: File[] = []
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i]
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) imageFiles.push(file)
          }
        }

        if (imageFiles.length > 0) {
          event.preventDefault()
          validateAndAddFiles(imageFiles)
          return true
        }

        // Always paste as plain text to avoid inherited formatting
        const text = clipboardData.getData('text/plain')
        if (text) {
          event.preventDefault()
          // Clear any active marks before inserting
          const tr = view.state.tr.insertText(text)
          tr.setStoredMarks([])
          tr.scrollIntoView()
          view.dispatch(tr)
          return true
        }

        return false
      },
      handleKeyDown: (view, event) => {
        // Check if any suggestion popup is active
        const hasSuggestionActive = hasActiveSuggestion(view.state)

        // Don't intercept certain keys when a suggestion popup is active
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter' || event.key === 'Tab') {
          if (hasSuggestionActive) return false
        }

        // Prevent Tab from inserting tab character when no suggestion is active
        if (event.key === 'Tab') {
          event.preventDefault()
          return true
        }

        // Escape to interrupt agent (only if no suggestion popup is active)
        if (event.key === 'Escape') {
          if (hasSuggestionActive) return false // Let popup handle it
          handleInterruptRef.current()
          return true
        }

        // Arrow key history navigation (cursor at start/end of doc, or already navigating)
        if (event.key === 'ArrowUp') {
          const { from } = view.state.selection
          if (from <= 1 || isNavigatingRef.current) {
            event.preventDefault()
            navigateUp()
            return true
          }
        }

        if (event.key === 'ArrowDown') {
          if (isNavigatingRef.current) {
            event.preventDefault()
            navigateDown()
            return true
          }
        }

        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (isHistoryNavRef.current) {
        isHistoryNavRef.current = false
      } else {
        resetNavigation()
      }
      historyValueRef.current = ed.getText()
      setIsEditorEmpty(ed.isEmpty)

      // Auto-resize (grow and shrink)
      resizeToFit()
    },
  })

  // Keep editorRef in sync for voice input callback
  editorRef.current = editor

  // Update editable state — editor stays editable during processing
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isEditorDisabled)
    }
  }, [editor, isEditorDisabled])

  // Reset height when editor is empty
  useEffect(() => {
    if (!editor || !isEditorEmpty) return

    setIsManuallyResized(false)
    isManuallyResizedRef.current = false
    setInputHeight(MIN_HEIGHT)
  }, [editor, isEditorEmpty])

  // Re-measure when chips row or file previews appear/disappear
  const hasEditSession = editSession !== null

  useEffect(() => {
    requestAnimationFrame(resizeToFit)
  }, [selectedNodeNames.length, files.length, hasEditSession, resizeToFit])

  // Keep the caret visible whenever the composer resizes (paste, typing that
  // grows the editor, voice transcript, chips/file rows appearing).
  useEffect(() => {
    const id = requestAnimationFrame(scrollCaretIntoView)
    return () => cancelAnimationFrame(id)
  }, [inputHeight, scrollCaretIntoView])

  const clearComposer = useCallback(
    (clearActiveTextSelection: boolean) => {
      editor?.commands.clearContent()
      onFilesChange([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      historyValueRef.current = ''
      resetNavigation()
      setIsEditorEmpty(true)
      setIsManuallyResized(false)
      isManuallyResizedRef.current = false
      setInputHeight(MIN_HEIGHT)

      if (clearActiveTextSelection) {
        setTextSelection(null)
      }
    },
    [editor, onFilesChange, resetNavigation, setTextSelection]
  )

  useEffect(() => {
    if (!editor || !editSession) {
      return
    }

    if (lastPrefilledEditSessionIdRef.current === editSession.id) {
      return
    }

    lastPrefilledEditSessionIdRef.current = editSession.id

    historyValueRef.current = editSession.message
    resetNavigation()
    editor.commands.setContent(buildEditorContent(editSession.message, editSession.mentions ?? []), {
      emitUpdate: false,
    })
    editor.commands.focus('end')
    if (fileInputRef.current) fileInputRef.current.value = ''

    requestAnimationFrame(() => {
      resizeToFit()
      scrollComposerToBottom()
    })
  }, [editor, editSession, resetNavigation, resizeToFit, scrollComposerToBottom])

  useEffect(() => {
    if (!editSession) {
      lastPrefilledEditSessionIdRef.current = null
    }
  }, [editSession])

  const handleCancelEdit = useCallback(() => {
    clearComposer(false)
    onCancelEdit?.()
  }, [clearComposer, onCancelEdit])

  const handleEditorSubmit = useCallback(() => {
    if (!editor || editor.isEmpty || isSubmitDisabled) return

    const { message, mentions } = serializeEditor(editor)
    if (!message.trim()) return

    addToHistory(message)
    onSubmit(message, files, mentions, textSelection)
    if (editSession) {
      onCancelEdit?.()
    }
    clearComposer(true)
  }, [addToHistory, clearComposer, editSession, editor, isSubmitDisabled, files, onSubmit, onCancelEdit, textSelection])
  submitRef.current = handleEditorSubmit

  const handleResizeChange = (newHeight: number) => {
    setInputHeight(newHeight)
    setIsManuallyResized(true)
    isManuallyResizedRef.current = true
  }

  const { isResizing, resizeRef, handleMouseDown } = useResize({
    direction: 'vertical',
    position: 'top',
    minSize: MIN_HEIGHT,
    maxSize: 600,
    onResize: handleResizeChange,
  })

  const validateAndAddFiles = useCallback(
    (newFiles: File[]) => {
      const validFiles: File[] = []

      for (const file of newFiles) {
        if (files.length + validFiles.length >= MAX_FILES) {
          console.warn(`Maximum ${MAX_FILES} files allowed`)
          break
        }
        if (file.size > MAX_FILE_SIZE) {
          console.warn(`File ${file.name} exceeds maximum size of 50MB`)
          continue
        }
        if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
          console.warn(`File type ${file.type} not accepted`)
          continue
        }
        validFiles.push(file)
      }

      if (validFiles.length > 0) onFilesChange([...files, ...validFiles])
    },
    [files, onFilesChange]
  )

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (selectedFiles && selectedFiles.length > 0) {
      validateAndAddFiles(Array.from(selectedFiles))
    }
  }

  const handleRemoveFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index)
    onFilesChange(newFiles)
  }

  // Drag/drop global
  useEffect(() => {
    let dragCounter = 0
    const handleWindowDragEnter = (e: DragEvent) => {
      dragCounter++
      if (e.dataTransfer?.types.includes('Files')) setIsDragging(true)
    }
    const handleWindowDragLeave = () => {
      dragCounter--
      if (dragCounter === 0) setIsDragging(false)
    }
    const handleWindowDrop = () => {
      dragCounter = 0
      setIsDragging(false)
    }
    window.addEventListener('dragenter', handleWindowDragEnter)
    window.addEventListener('dragleave', handleWindowDragLeave)
    window.addEventListener('drop', handleWindowDrop)
    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter)
      window.removeEventListener('dragleave', handleWindowDragLeave)
      window.removeEventListener('drop', handleWindowDrop)
    }
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) validateAndAddFiles(droppedFiles)
  }

  const handleContainerClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.drop-container-content')) {
      editor?.commands.focus()
    }
  }

  return (
    <form
      id="chat-input-form"
      onSubmit={(e) => {
        e.preventDefault()
        void handleEditorSubmit()
      }}
      className={`relative flex flex-col transition-all duration-150 ease-out ${isProcessing ? 'chat-input-active' : ''}`}
      style={{ height: `${inputHeight}px` }}
    >
      <ResizeHandle
        direction="vertical"
        position="top"
        isResizing={isResizing}
        resizeRef={resizeRef}
        onMouseDown={handleMouseDown}
      />

      {/* Fixed top: selected nodes chips */}
      {selectedNodeNames.length > 0 && (
        <div
          ref={chipsRowRef}
          className="flex items-center gap-1.5 overflow-x-auto px-4 pt-6 pb-1 shrink-0 scrollbar-hide"
        >
          <span className="text-xs text-foreground-muted font-medium shrink-0">
            {selectedNodeNames.length} selected
          </span>
          {selectedNodeNames.map((node) => (
            <span key={node.id} className="inline-flex items-center gap-1 shrink-0">
              {/* Yellow line count pill if this node has text selection */}
              {textSelection && textSelection.nodeId === node.id && (
                <>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-yellow-500/50 text-xs font-medium whitespace-nowrap bg-yellow-400/20 text-yellow-700 dark:text-yellow-300">
                    {textSelection.lineCount} {textSelection.lineCount === 1 ? 'line' : 'lines'}
                  </span>
                  <span className="text-xs text-foreground-muted">&lt;</span>
                </>
              )}
              {/* Document chip */}
              <span className="group/chip relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-yellow-500/50 text-xs font-medium whitespace-nowrap cursor-default bg-yellow-400/20 text-yellow-700 dark:text-yellow-300">
                <span className="inline-flex items-center gap-1 group-hover/chip:opacity-30 transition-opacity">
                  <i className="fa-solid fa-file-lines text-[11px] opacity-50" />
                  {node.name}
                </span>
                {onDeselectNode && (
                  <button
                    type="button"
                    className="absolute inset-0 hidden group-hover/chip:flex items-center justify-end pr-0.5 cursor-pointer"
                    onClick={() => {
                      // Clear text selection if this node had it
                      if (textSelection?.nodeId === node.id) {
                        setTextSelection(null)
                      }
                      onDeselectNode(node.id)
                    }}
                  >
                    <span
                      className="flex items-center justify-center w-5 h-5 rounded text-[12px] border"
                      style={{
                        background: 'var(--outline)',
                        color: 'var(--foreground)',
                        borderColor: 'var(--outline)',
                      }}
                    >
                      <i className="fa-solid fa-xmark" />
                    </span>
                  </button>
                )}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES.join(',')}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={isEditorDisabled}
      />

      {editSession && (
        <div ref={editBannerRef} className="shrink-0 px-4 pt-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-chat-pill-border bg-chat-clear px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-foreground">Editing previous message</div>
              <div className="truncate text-xs text-foreground-muted">{editSession.label}</div>
            </div>
            {onCancelEdit && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-foreground-muted hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fixed: file preview row above editor */}
      {files.length > 0 && (
        <div ref={filePreviewRowRef} className="shrink-0 px-4 pt-2">
          <FilePreviewList files={files} onRemoveFile={handleRemoveFile} />
        </div>
      )}

      {/* Scrollable middle: editor content */}
      <div
        ref={dropContainerRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleContainerClick}
        className={`flex-1 relative flex flex-col overflow-y-auto px-4 pb-2 cursor-text drop-container-content scrollbar-hide ${selectedNodeNames.length > 0 || files.length > 0 ? 'pt-2' : 'pt-6'}`}
      >
        {isDragging && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none bg-canvas border-2 border-dashed border-foreground rounded-lg">
            <svg
              className="w-10 h-10 mb-3 text-foreground-muted"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 20 16"
            >
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
              />
            </svg>
            <p className="mb-1 text-sm text-foreground">
              <span className="font-semibold">Drop files here</span>
            </p>
            <p className="text-xs text-foreground-muted">Images, videos, audio, documents (Max 50MB)</p>
          </div>
        )}

        {/* Voice recording waveform overlay */}
        {(isRecording || isTranscribing) && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-canvas px-8">
            {isRecording ? (
              <VoiceWaveform analyserRef={analyserRef} isRecording={isRecording} />
            ) : (
              <div className="flex items-center gap-2 text-sm text-foreground-muted">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                Transcribing...
              </div>
            )}
          </div>
        )}

        {/* TipTap Editor */}
        <div
          className="chat-editor"
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      <div ref={buttonRowRef} className="shrink-0 flex justify-between items-center px-4 pt-2 pb-4">
        <div className="flex items-center gap-2">
          {/* + button for file attachment */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isEditorDisabled}
            className="group chat-toolbar-plus w-[36px] h-[36px] flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer disabled:!cursor-not-allowed"
            title="Attach file"
          >
            <i className="fa-regular fa-plus text-[16px] group-hover:!hidden"></i>
            <i className="fa-solid fa-plus text-[16px] !hidden group-hover:!inline-block"></i>
          </button>
          <AgentModeSelector showDirectModeTip={showDirectModeTip} onDismissDirectModeTip={onDismissDirectModeTip} />
        </div>

        {/* mic + submit */}
        <div className="flex items-center gap-2">
          {/* Mic button for voice input */}
          {isVoiceSupported && (
            <div className="relative">
              {showVoiceTip && !isRecording && !isTranscribing && onDismissVoiceTip && (
                <VoiceInputTip onDismiss={onDismissVoiceTip} />
              )}
              <button
                type="button"
                disabled={isTranscribing || isEditorDisabled}
                onClick={() => {
                  toggleRecording()
                  if (showVoiceTip && onDismissVoiceTip) onDismissVoiceTip()
                }}
                className={`group chat-toolbar-mic w-[36px] h-[36px] flex items-center justify-center rounded-full text-sm transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer disabled:!cursor-not-allowed relative ${showVoiceTip && !isRecording && !isTranscribing ? 'animate-amber-pulse' : ''}`}
                style={
                  isRecording
                    ? {
                        background: '#FEE2E2',
                        border: '1px solid #FECACA',
                        color: 'var(--destructive, #ef4444)',
                      }
                    : undefined
                }
                title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing...' : 'Voice input'}
              >
                {isRecording ? (
                  <div className="relative flex items-center justify-center">
                    <span className="absolute w-6 h-6 rounded-full bg-red-500/20 animate-ping" />
                    <i className="fa-solid fa-stop text-[12px] relative"></i>
                  </div>
                ) : (
                  <>
                    <i className="fa-regular fa-microphone text-[16px] group-hover:!hidden"></i>
                    <i className="fa-solid fa-microphone text-[16px] !hidden group-hover:!inline-block"></i>
                  </>
                )}
              </button>
            </div>
          )}
          <button
            type={isProcessing ? 'button' : 'submit'}
            disabled={!isProcessing && (isEditorEmpty || isSubmitDisabled)}
            onClick={isProcessing ? handleInterrupt : undefined}
            onMouseEnter={() => setIsSubmitHovered(true)}
            onMouseLeave={() => setIsSubmitHovered(false)}
            className="chat-toolbar-submit relative w-[36px] h-[36px] flex items-center justify-center text-sm transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer disabled:opacity-50 disabled:!cursor-not-allowed"
            title={isProcessing ? 'Click to stop' : undefined}
          >
            {isProcessing ? (
              isStopping ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
              ) : isSubmitHovered ? (
                <i className="fa-solid fa-stop text-[12px]"></i>
              ) : (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
              )
            ) : (
              <i className="fa-solid fa-arrow-up text-[14px]"></i>
            )}
          </button>
        </div>
      </div>
    </form>
  )
}
