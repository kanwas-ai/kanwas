import { useState, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import type { AskQuestionItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { ChatMessage } from './ChatMessage'
import { VoiceWaveform } from './VoiceWaveform'

const OTHER_ID = '__other__'
const OTHER_PREFIX = '__other__:'
const MAX_NUMBER_SHORTCUT = 9
const FOOTER_COMPACT_ENTER_THRESHOLD_PX = 2
const FOOTER_COMPACT_EXIT_THRESHOLD_PX = 12
const TOOLTIP_CLASS =
  'z-50 pointer-events-none bg-canvas border border-outline rounded px-2 py-1 text-xs font-medium text-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-100'

interface AskQuestionProps {
  item: DeepReadonly<AskQuestionItem>
  isPending: boolean
  onAnswer: (itemId: string, answers: Record<string, string[]>) => void
  streaming?: boolean
  streamingPhase?: 'question_generation'
}

function AskingQuestionPlaceholder() {
  return (
    <div className="inline-block bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-[var(--chat-radius)] animate-shimmer">
      <div className="inline-flex items-center gap-2 text-sm text-foreground-muted px-3 py-1.5">
        <i className="fa-solid fa-circle-question w-4 text-center flex-shrink-0 text-[12px] opacity-70" />
        <span>Asking a question</span>
      </div>
    </div>
  )
}

function AskQuestionContext({ item, streaming = false }: { item: DeepReadonly<AskQuestionItem>; streaming?: boolean }) {
  if (!item.context) {
    return null
  }

  return (
    <div className="py-1">
      <ChatMessage
        item={{ id: `${item.id}-context`, type: 'chat', message: item.context, timestamp: item.timestamp }}
        streaming={streaming}
      />
    </div>
  )
}

function IconTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={TOOLTIP_CLASS} side="top" sideOffset={8}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function AskQuestion({ item, isPending, onAnswer, streaming, streamingPhase }: AskQuestionProps) {
  // All hooks must be called before any conditional returns
  // Track selected options for each question
  const [selections, setSelections] = useState<Record<string, string[]>>(() => {
    // Initialize with empty arrays for each question
    const initial: Record<string, string[]> = {}
    for (const q of item.questions) {
      initial[q.id] = []
    }
    return initial
  })

  // Track "Other" text input for each question
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const q of item.questions) {
      initial[q.id] = ''
    }
    return initial
  })

  // Ref for the "Other" textarea field
  const otherInputRef = useRef<HTMLTextAreaElement>(null)
  const voiceTargetQuestionIdRef = useRef<string | null>(null)

  // Tab state for multi-question navigation
  const [currentTab, setCurrentTab] = useState(0)

  // Keyboard-highlighted option on current question (-1 = none)
  const [highlightedOptionIndex, setHighlightedOptionIndex] = useState(-1)

  // Footer layout refs for compact mode switching
  const footerContainerRef = useRef<HTMLDivElement>(null)
  const footerMeasureRef = useRef<HTMLDivElement>(null)
  const [isFooterCompact, setIsFooterCompact] = useState(false)

  // Derived values
  const totalTabs = item.questions.length
  const hasMultipleTabs = totalTabs > 1
  const isLastTab = currentTab === totalTabs - 1
  const isFirstTab = currentTab === 0
  const currentQuestion = item.questions[currentTab]
  const currentSelections = currentQuestion ? selections[currentQuestion.id] || [] : []
  const currentOtherText = currentQuestion ? otherTexts[currentQuestion.id] || '' : ''
  const isOtherSelected = currentSelections.includes(OTHER_ID)
  const currentQuestionHasSelection = currentSelections.length > 0
  const hasContext = typeof item.context === 'string' && item.context.trim().length > 0

  // Explicit progression: select first, then Next/Confirm
  const showNextButton = hasMultipleTabs && !isLastTab
  const showConfirmButton = !hasMultipleTabs || isLastTab

  const handleTranscript = useCallback(
    (text: string) => {
      const transcript = text.trim()
      if (!transcript) return

      const questionId = voiceTargetQuestionIdRef.current || currentQuestion?.id
      if (!questionId) return

      setOtherTexts((prev) => {
        const existing = prev[questionId] || ''
        const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
        return { ...prev, [questionId]: `${existing}${separator}${transcript}` }
      })

      requestAnimationFrame(() => otherInputRef.current?.focus())
    },
    [currentQuestion?.id]
  )

  const {
    isRecording,
    isTranscribing,
    isSupported: isVoiceSupported,
    toggleRecording,
    analyserRef,
  } = useVoiceInput({ onTranscript: handleTranscript })

  const handleOptionClick = useCallback((questionId: string, optionId: string, multiSelect: boolean) => {
    const isOther = optionId === OTHER_ID

    if (multiSelect) {
      // Multi-select: toggle selection
      setSelections((prev) => {
        const current = prev[questionId] || []
        if (current.includes(optionId)) {
          return { ...prev, [questionId]: current.filter((id) => id !== optionId) }
        }
        return { ...prev, [questionId]: [...current, optionId] }
      })
      // Focus the input if "Other" was just selected
      if (isOther) {
        setTimeout(() => otherInputRef.current?.focus(), 0)
      }
    } else {
      // Single-select: set selection and wait for explicit Next/Confirm
      setSelections((prev) => ({ ...prev, [questionId]: [optionId] }))
      if (isOther) {
        setTimeout(() => otherInputRef.current?.focus(), 0)
      }
    }
  }, [])

  const handleConfirm = useCallback(() => {
    if (isPending) return
    // Build final answers, replacing OTHER_ID with OTHER_PREFIX + text
    const finalAnswers: Record<string, string[]> = {}
    for (const q of item.questions) {
      const selected = selections[q.id] || []
      finalAnswers[q.id] = selected.map((id) => {
        if (id === OTHER_ID) {
          return `${OTHER_PREFIX}${otherTexts[q.id] || ''}`
        }
        return id
      })
    }
    onAnswer(item.id, finalAnswers)
  }, [item.id, selections, otherTexts, isPending, onAnswer, item.questions])

  const handleSkip = useCallback(() => {
    if (isPending) return
    // Send empty answers
    const emptyAnswers: Record<string, string[]> = {}
    for (const q of item.questions) {
      emptyAnswers[q.id] = []
    }
    onAnswer(item.id, emptyAnswers)
  }, [item.id, item.questions, isPending, onAnswer])

  const handleNext = useCallback(() => {
    if (isPending) return
    setCurrentTab((prev) => Math.min(prev + 1, totalTabs - 1))
  }, [isPending, totalTabs])

  const handleBack = useCallback(() => {
    if (isPending) return
    setCurrentTab((prev) => Math.max(prev - 1, 0))
  }, [isPending])

  const handlePrimaryAction = useCallback(() => {
    if (showNextButton && currentQuestionHasSelection) {
      handleNext()
      return
    }

    if (showConfirmButton) {
      handleConfirm()
    }
  }, [currentQuestionHasSelection, handleConfirm, handleNext, showConfirmButton, showNextButton])

  const resizeOtherInput = useCallback((textarea: HTMLTextAreaElement | null = otherInputRef.current) => {
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [])

  const updateFooterLayout = useCallback(() => {
    const container = footerContainerRef.current
    const measure = footerMeasureRef.current

    if (!container || !measure) return

    const availableWidth = container.clientWidth
    const requiredInlineWidth = measure.scrollWidth

    setIsFooterCompact((prev) => {
      if (prev) {
        return requiredInlineWidth > availableWidth - FOOTER_COMPACT_EXIT_THRESHOLD_PX
      }
      return requiredInlineWidth > availableWidth + FOOTER_COMPACT_ENTER_THRESHOLD_PX
    })
  }, [])

  useEffect(() => {
    setHighlightedOptionIndex(-1)
  }, [currentQuestion?.id])

  useLayoutEffect(() => {
    if (!isOtherSelected) return
    resizeOtherInput()
  }, [currentOtherText, currentQuestion?.id, isOtherSelected, resizeOtherInput])

  useEffect(() => {
    if (streaming || item.status !== 'pending') return

    const container = footerContainerRef.current
    const measure = footerMeasureRef.current

    if (!container || !measure) return

    updateFooterLayout()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => updateFooterLayout())
    observer.observe(container)
    observer.observe(measure)

    return () => observer.disconnect()
  }, [updateFooterLayout, streaming, item.status])

  useEffect(() => {
    const animationFrameId = requestAnimationFrame(updateFooterLayout)
    return () => cancelAnimationFrame(animationFrameId)
  }, [
    updateFooterLayout,
    currentQuestion?.id,
    currentQuestion?.options.length,
    currentQuestion?.multiSelect,
    hasMultipleTabs,
    showNextButton,
    showConfirmButton,
    isPending,
  ])

  // Keyboard shortcuts
  useEffect(() => {
    if (item.status !== 'pending') return
    if (!currentQuestion) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in an input/textarea/contenteditable
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return
      }

      // Number shortcuts map to options (1-9)
      if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const shortcutIndex = Number(e.key) - 1
        const totalOptions = currentQuestion.options.length + 1 // +1 for "Other"

        if (shortcutIndex < totalOptions) {
          e.preventDefault()
          e.stopPropagation()
          setHighlightedOptionIndex(shortcutIndex)
          const option = currentQuestion.options[shortcutIndex]
          if (option) {
            handleOptionClick(currentQuestion.id, option.id, currentQuestion.multiSelect)
          } else {
            handleOptionClick(currentQuestion.id, OTHER_ID, currentQuestion.multiSelect)
          }
        }
        return
      }

      // Enter key behavior
      if (e.key === 'Enter' && !e.shiftKey) {
        // Multi-select uses Enter only for toggling the highlighted option.
        // Progression uses ArrowRight to avoid accidental deselection on submit.
        if (currentQuestion.multiSelect) {
          e.preventDefault()
          e.stopPropagation()

          if (highlightedOptionIndex >= 0) {
            const option = currentQuestion.options[highlightedOptionIndex]
            const highlightedOptionId = option ? option.id : OTHER_ID
            handleOptionClick(currentQuestion.id, highlightedOptionId, true)
          }
          return
        }

        // If an option is keyboard-highlighted:
        // - first Enter selects it
        // - second Enter on the same selected option continues (single-select only)
        if (highlightedOptionIndex >= 0) {
          e.preventDefault()
          e.stopPropagation()
          const option = currentQuestion.options[highlightedOptionIndex]
          const highlightedOptionId = option ? option.id : OTHER_ID
          const selectedForCurrentQuestion = selections[currentQuestion.id] || []
          const highlightedIsSelected = selectedForCurrentQuestion.includes(highlightedOptionId)

          if (!highlightedIsSelected) {
            handleOptionClick(currentQuestion.id, highlightedOptionId, currentQuestion.multiSelect)
            return
          }

          if (highlightedOptionId === OTHER_ID) {
            setTimeout(() => otherInputRef.current?.focus(), 0)
            return
          }

          if (showNextButton && currentQuestionHasSelection) {
            handleNext()
          } else if (showConfirmButton) {
            handleConfirm()
          }
          return
        }

        e.preventDefault()
        e.stopPropagation()
        if (showNextButton && currentQuestionHasSelection) {
          handleNext()
        } else if (showConfirmButton) {
          handleConfirm()
        }
        return
      }

      // Arrow up/down for option navigation on current question (including "Other")
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        const totalOptions = currentQuestion.options.length + 1 // +1 for "Other"
        setHighlightedOptionIndex((prev) => {
          if (e.key === 'ArrowDown') {
            if (prev < 0) return 0
            return (prev + 1) % totalOptions
          }
          if (prev < 0) return totalOptions - 1
          return (prev - 1 + totalOptions) % totalOptions
        })
        return
      }

      // Arrow left/right navigation. Always consume so canvas doesn't navigate.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()

        // In multi-select, ArrowRight progresses (Next/Confirm), ArrowLeft goes back.
        if (currentQuestion.multiSelect) {
          if (e.key === 'ArrowLeft' && hasMultipleTabs) {
            handleBack()
            return
          }

          if (e.key === 'ArrowRight') {
            if (showNextButton && currentQuestionHasSelection) {
              handleNext()
              return
            }

            if (showConfirmButton) {
              handleConfirm()
              return
            }
          }
          return
        }

        if (hasMultipleTabs) {
          if (e.key === 'ArrowLeft') {
            handleBack()
            return
          }
          if (e.key === 'ArrowRight') {
            handleNext()
            return
          }
        }
        return
      }
    }

    // Capture phase ensures this runs before document-level canvas hotkeys.
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    item.status,
    currentQuestion,
    hasMultipleTabs,
    showNextButton,
    showConfirmButton,
    selections,
    currentQuestionHasSelection,
    highlightedOptionIndex,
    handleConfirm,
    handleOptionClick,
    handleNext,
    handleBack,
  ])

  // Streaming state - question still being generated
  if (streaming) {
    if (!hasContext) {
      return <AskingQuestionPlaceholder />
    }

    if (streamingPhase !== 'question_generation') {
      return <AskQuestionContext item={item} streaming />
    }

    return (
      <div className="space-y-2">
        <AskQuestionContext item={item} streaming />
        <AskingQuestionPlaceholder />
      </div>
    )
  }

  // Answered state - show compact summary
  if (item.status === 'answered') {
    return (
      <div className="space-y-2">
        {hasContext && <AskQuestionContext item={item} />}

        <div className="space-y-2 bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-[var(--chat-radius)] p-4">
          {item.questions.map((q) => {
            const selectedIds = item.answers?.[q.id] || []
            const selectedLabels = selectedIds
              .map((id) => {
                // Handle "Other" answers with custom text
                if (id.startsWith(OTHER_PREFIX)) {
                  const customText = id.slice(OTHER_PREFIX.length)
                  return customText ? `Other: "${customText}"` : 'Other'
                }
                return q.options.find((o) => o.id === id)?.label
              })
              .filter(Boolean)

            return (
              <div key={q.id} className="flex items-center gap-3">
                <i className="fa-solid fa-square-check text-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground-muted">{q.text}</div>
                  <div className="text-sm text-foreground font-medium">
                    {selectedLabels.length > 0 ? selectedLabels.join(', ') : '(skipped)'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Skipped state
  if (item.status === 'skipped') {
    return (
      <div className="space-y-2">
        {hasContext && <AskQuestionContext item={item} />}

        <div className="bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-[var(--chat-radius)] p-4">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-square text-foreground-muted" />
            <span className="text-sm text-foreground-muted">Questions skipped</span>
          </div>
        </div>
      </div>
    )
  }

  // Guard against missing current question
  if (!currentQuestion) {
    return null
  }

  const otherOptionIndex = currentQuestion.options.length
  const isOtherHighlighted = highlightedOptionIndex === otherOptionIndex
  const totalSelectableOptions = currentQuestion.options.length + 1
  const maxShortcutKey = Math.min(totalSelectableOptions, MAX_NUMBER_SHORTCUT)
  const shortcutHint = maxShortcutKey > 1 ? `1-${maxShortcutKey}` : '1'
  const actionShortcutKey = currentQuestion.multiSelect ? '→' : '↵'
  const actionShortcutTitle = currentQuestion.multiSelect ? 'Right Arrow' : 'Enter'
  const primaryActionButton = showNextButton ? (
    <button
      onClick={handleNext}
      disabled={isPending || !currentQuestionHasSelection}
      className="px-3 py-1.5 text-sm bg-foreground text-block-highlight rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2 shrink-0"
    >
      Next
      <kbd
        aria-label={`${actionShortcutTitle} shortcut`}
        title={actionShortcutTitle}
        className="text-[12px] leading-none font-mono px-1.5 py-px rounded border border-block-highlight/35 bg-block-highlight/10 text-block-highlight/80"
      >
        {actionShortcutKey}
      </kbd>
    </button>
  ) : showConfirmButton ? (
    <button
      onClick={handleConfirm}
      disabled={isPending}
      className="px-3 py-1.5 text-sm bg-foreground text-block-highlight rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2 shrink-0"
    >
      {isPending ? (
        'Submitting...'
      ) : (
        <>
          Confirm
          <kbd
            aria-label={`${actionShortcutTitle} shortcut`}
            title={actionShortcutTitle}
            className="text-[12px] leading-none font-mono px-1.5 py-px rounded border border-block-highlight/35 bg-block-highlight/10 text-block-highlight/80"
          >
            {actionShortcutKey}
          </kbd>
        </>
      )}
    </button>
  ) : null

  // Pending state - show interactive UI with tabs
  return (
    <div className="space-y-2">
      {hasContext && <AskQuestionContext item={item} />}

      <div className="border border-chat-pill-border bg-chat-pill rounded-[var(--chat-radius)] p-4 shadow-chat-pill">
        {/* Current question content */}
        <div className="space-y-3">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm text-foreground font-medium leading-6">{currentQuestion.text}</div>

              {hasMultipleTabs && (
                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  <span className="text-xs text-foreground-muted">
                    {currentTab + 1} of {totalTabs}
                  </span>
                  <button
                    onClick={handleBack}
                    disabled={isPending || isFirstTab}
                    className="w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-block-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Previous question"
                  >
                    <i className="fa-solid fa-chevron-left text-[12px]" />
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={isPending || isLastTab}
                    className="w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-block-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Next question"
                  >
                    <i className="fa-solid fa-chevron-right text-[12px]" />
                  </button>
                </div>
              )}
            </div>

            <div className="text-xs text-foreground-muted mt-1">
              {currentQuestion.multiSelect
                ? 'Select all that apply'
                : showNextButton
                  ? 'Choose one option, then click Next'
                  : 'Choose one option, then click Confirm'}
            </div>
          </div>

          <div className="space-y-1.5">
            {currentQuestion.options.map((option, oIndex) => {
              const isSelected = selections[currentQuestion.id]?.includes(option.id)
              const isHighlighted = highlightedOptionIndex === oIndex
              const shortcutLabel = oIndex < MAX_NUMBER_SHORTCUT ? String(oIndex + 1) : null

              return (
                <button
                  key={option.id}
                  onClick={() => {
                    setHighlightedOptionIndex(oIndex)
                    handleOptionClick(currentQuestion.id, option.id, currentQuestion.multiSelect)
                  }}
                  onMouseEnter={() => setHighlightedOptionIndex(oIndex)}
                  disabled={isPending}
                  className={`
                  w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg border text-left transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${
                    isSelected
                      ? 'bg-chat-background border-foreground/50 ring-1 ring-foreground/20'
                      : isHighlighted
                        ? 'bg-block-hover border-foreground/30 ring-1 ring-foreground/10'
                        : 'border-transparent hover:bg-block-hover hover:border-foreground/20'
                  }
                `}
                >
                  <div
                    className={`
                    w-6 h-6 shrink-0 rounded-md border flex items-center justify-center text-[11px] font-medium
                    transition-colors
                    ${
                      isSelected
                        ? 'border-foreground/70 bg-foreground text-block-highlight'
                        : isHighlighted
                          ? 'border-outline bg-chat-background text-foreground'
                          : 'border-outline/80 bg-chat-background/80 text-foreground-muted'
                    }
                  `}
                  >
                    {shortcutLabel ? shortcutLabel : <i className="fa-solid fa-ellipsis text-[9px]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isSelected ? 'text-foreground font-medium' : 'text-foreground'}`}>
                        {option.label}
                      </span>
                    </div>
                    {option.description && (
                      <div className="text-xs text-foreground-muted mt-0.5">{option.description}</div>
                    )}
                  </div>

                  <div className="w-4 shrink-0 text-center text-foreground-muted">
                    {isSelected ? (
                      <i className="fa-solid fa-check text-[11px] text-foreground" />
                    ) : isHighlighted ? (
                      <i className="fa-solid fa-arrow-right text-[11px]" />
                    ) : null}
                  </div>
                </button>
              )
            })}

            {/* "Other" option */}
            <div
              onClick={() => {
                if (!isPending && (currentQuestion.multiSelect || !isOtherSelected)) {
                  setHighlightedOptionIndex(otherOptionIndex)
                  handleOptionClick(currentQuestion.id, OTHER_ID, currentQuestion.multiSelect)
                }
              }}
              onMouseEnter={() => setHighlightedOptionIndex(otherOptionIndex)}
              className={`
              w-full flex ${isOtherSelected ? 'items-start' : 'items-center'} gap-3 px-2.5 py-2.5 rounded-lg border text-left transition-all
              ${isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${
                isOtherSelected
                  ? 'bg-chat-background border-foreground/50 ring-1 ring-foreground/20'
                  : isOtherHighlighted
                    ? 'bg-block-hover border-foreground/30 ring-1 ring-foreground/10'
                    : 'border-transparent hover:bg-block-hover hover:border-foreground/20'
              }
            `}
            >
              <div
                onClick={(e) => {
                  if (!isPending) {
                    e.stopPropagation()
                    setHighlightedOptionIndex(otherOptionIndex)
                    handleOptionClick(currentQuestion.id, OTHER_ID, currentQuestion.multiSelect)
                  }
                }}
                className={`
                w-6 h-6 shrink-0 rounded-md border flex items-center justify-center cursor-pointer text-[11px]
                transition-colors
                ${
                  isOtherSelected
                    ? 'border-foreground/70 bg-foreground text-block-highlight'
                    : isOtherHighlighted
                      ? 'border-outline bg-chat-background text-foreground'
                      : 'border-outline/80 bg-chat-background/80 text-foreground-muted'
                }
              `}
              >
                <i className="fa-solid fa-pen-to-square text-[12px]" />
              </div>

              <div className="flex-1 min-w-0 self-stretch">
                {isOtherSelected ? (
                  <div className="w-full space-y-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex w-full items-start gap-1.5">
                      <div className="relative min-w-0 flex-[1_1_0%]">
                        <textarea
                          ref={otherInputRef}
                          value={currentOtherText}
                          onChange={(e) => {
                            setOtherTexts((prev) => ({ ...prev, [currentQuestion.id]: e.target.value }))
                            resizeOtherInput(e.currentTarget)
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation()

                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                              e.preventDefault()
                              handlePrimaryAction()
                            }
                          }}
                          placeholder="Type your answer..."
                          disabled={isPending}
                          rows={1}
                          className="w-full min-h-[38px] resize-none overflow-hidden px-2.5 py-2 text-sm leading-5 bg-chat-background border border-outline rounded-md text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        />

                        {(isRecording || isTranscribing) && (
                          <div
                            aria-label="Voice input overlay"
                            className="absolute inset-0 z-10 flex items-center justify-center rounded-md border border-outline bg-chat-background px-3 py-2"
                          >
                            {isRecording ? (
                              <VoiceWaveform analyserRef={analyserRef} isRecording={isRecording} />
                            ) : (
                              <div className="flex items-center gap-2 text-xs text-foreground-muted">
                                <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                                Transcribing...
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <Tooltip.Provider delayDuration={300} skipDelayDuration={0}>
                        <div className="flex shrink-0 items-center gap-1">
                          {isVoiceSupported && (
                            <IconTooltip label={isRecording ? 'Stop recording' : 'Dictate a custom answer'}>
                              <button
                                type="button"
                                disabled={isPending || isTranscribing}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (!isRecording) {
                                    voiceTargetQuestionIdRef.current = currentQuestion.id
                                  }
                                  toggleRecording()
                                }}
                                className="chat-toolbar-mic w-[32px] h-[32px] flex items-center justify-center rounded-full text-sm transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer disabled:!cursor-not-allowed shrink-0"
                                style={
                                  isRecording
                                    ? {
                                        background: '#FEE2E2',
                                        border: '1px solid #FECACA',
                                        color: 'var(--destructive, #ef4444)',
                                      }
                                    : undefined
                                }
                                aria-label={isRecording ? 'Stop recording' : 'Voice input'}
                              >
                                {isRecording ? (
                                  <div className="relative flex items-center justify-center">
                                    <span className="absolute w-5 h-5 rounded-full bg-red-500/20 animate-ping" />
                                    <i className="fa-solid fa-stop text-[11px] relative" />
                                  </div>
                                ) : isTranscribing ? (
                                  <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                                ) : (
                                  <i className="fa-solid fa-microphone text-[14px]" />
                                )}
                              </button>
                            </IconTooltip>
                          )}

                          <IconTooltip label={showNextButton ? 'Continue to the next question' : 'Submit this answer'}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePrimaryAction()
                              }}
                              disabled={isPending || (showNextButton && !currentQuestionHasSelection)}
                              className="chat-toolbar-mic w-[32px] h-[32px] flex items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer disabled:!cursor-not-allowed"
                              aria-label={showNextButton ? 'Next question' : 'Confirm answer'}
                            >
                              <i className="fa-solid fa-check text-[13px]" />
                            </button>
                          </IconTooltip>
                        </div>
                      </Tooltip.Provider>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">Other</span>
                    </div>
                    <div className="text-xs text-foreground-muted mt-0.5">Write your own answer</div>
                  </>
                )}
              </div>

              {!isOtherSelected && (
                <div className="w-4 shrink-0 text-center text-foreground-muted">
                  {isOtherHighlighted ? <i className="fa-solid fa-arrow-right text-[11px]" /> : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer with buttons */}
        <div ref={footerContainerRef} className="relative pt-3 mt-3 border-t border-outline/30">
          <div aria-hidden="true" className="absolute left-0 top-0 h-0 overflow-hidden opacity-0 pointer-events-none">
            <div ref={footerMeasureRef} className="inline-flex items-center gap-2 whitespace-nowrap">
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-[12px] text-foreground-muted">
                  <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                    Esc
                  </kbd>
                  <span className="text-foreground-muted/80">to</span>
                </div>

                <div className="px-3 py-1.5 text-xs font-medium tracking-wide rounded-md border border-outline bg-chat-background text-foreground">
                  SKIP
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-[12px] text-foreground-muted flex items-center gap-1.5 whitespace-nowrap">
                  <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                    {shortcutHint}
                  </kbd>
                  <span>quick pick</span>
                  <span className="text-foreground-muted/50">•</span>
                  <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                    ↑↓
                  </kbd>
                  <span>navigate</span>
                  {currentQuestion.multiSelect ? (
                    <>
                      {hasMultipleTabs && (
                        <>
                          <span className="text-foreground-muted/50">•</span>
                          <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                            ←
                          </kbd>
                          <span>back</span>
                        </>
                      )}
                      <span className="text-foreground-muted/50">•</span>
                      <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                        →
                      </kbd>
                      <span>{showNextButton ? 'continue' : 'confirm'}</span>
                    </>
                  ) : (
                    hasMultipleTabs && (
                      <>
                        <span className="text-foreground-muted/50">•</span>
                        <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                          ←→
                        </kbd>
                        <span>question</span>
                      </>
                    )
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {showNextButton ? (
                    <div className="px-3 py-1.5 text-sm bg-foreground text-block-highlight rounded-md flex items-center gap-2 shrink-0">
                      Next
                      <kbd className="text-[12px] leading-none font-mono px-1.5 py-px rounded border border-block-highlight/35 bg-block-highlight/10 text-block-highlight/80">
                        {actionShortcutKey}
                      </kbd>
                    </div>
                  ) : showConfirmButton ? (
                    <div className="px-3 py-1.5 text-sm bg-foreground text-block-highlight rounded-md flex items-center gap-2 shrink-0">
                      {isPending ? (
                        'Submitting...'
                      ) : (
                        <>
                          Confirm
                          <kbd className="text-[12px] leading-none font-mono px-1.5 py-px rounded border border-block-highlight/35 bg-block-highlight/10 text-block-highlight/80">
                            {actionShortcutKey}
                          </kbd>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {isFooterCompact ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 text-[12px] text-foreground-muted">
                    <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                      Esc
                    </kbd>
                    <span className="text-foreground-muted/80">to</span>
                  </div>

                  <button
                    onClick={handleSkip}
                    disabled={isPending}
                    className="px-3 py-1.5 text-xs font-medium tracking-wide rounded-md border border-outline bg-chat-background text-foreground hover:bg-block-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    SKIP
                  </button>
                </div>

                <div className="flex items-center gap-2 shrink-0">{primaryActionButton}</div>
              </div>

              <div className="text-[12px] text-foreground-muted flex flex-wrap items-center gap-1.5">
                <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                  {shortcutHint}
                </kbd>
                <span>quick pick</span>
                <span className="text-foreground-muted/50">•</span>
                <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                  ↑↓
                </kbd>
                <span>navigate</span>
                {currentQuestion.multiSelect ? (
                  <>
                    {hasMultipleTabs && (
                      <>
                        <span className="text-foreground-muted/50">•</span>
                        <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                          ←
                        </kbd>
                        <span>back</span>
                      </>
                    )}
                    <span className="text-foreground-muted/50">•</span>
                    <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                      →
                    </kbd>
                    <span>{showNextButton ? 'continue' : 'confirm'}</span>
                  </>
                ) : (
                  hasMultipleTabs && (
                    <>
                      <span className="text-foreground-muted/50">•</span>
                      <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                        ←→
                      </kbd>
                      <span>question</span>
                    </>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full">
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-[12px] text-foreground-muted">
                  <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                    Esc
                  </kbd>
                  <span className="text-foreground-muted/80">to</span>
                </div>

                <button
                  onClick={handleSkip}
                  disabled={isPending}
                  className="px-3 py-1.5 text-xs font-medium tracking-wide rounded-md border border-outline bg-chat-background text-foreground hover:bg-block-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  SKIP
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2 min-w-0">
                <div className="text-[12px] text-foreground-muted flex items-center gap-1.5 whitespace-nowrap min-w-0 overflow-hidden">
                  <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                    {shortcutHint}
                  </kbd>
                  <span>quick pick</span>
                  <span className="text-foreground-muted/50">•</span>
                  <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                    ↑↓
                  </kbd>
                  <span>navigate</span>
                  {currentQuestion.multiSelect ? (
                    <>
                      {hasMultipleTabs && (
                        <>
                          <span className="text-foreground-muted/50">•</span>
                          <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                            ←
                          </kbd>
                          <span>back</span>
                        </>
                      )}
                      <span className="text-foreground-muted/50">•</span>
                      <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                        →
                      </kbd>
                      <span>{showNextButton ? 'continue' : 'confirm'}</span>
                    </>
                  ) : (
                    hasMultipleTabs && (
                      <>
                        <span className="text-foreground-muted/50">•</span>
                        <kbd className="font-mono px-1 py-px rounded border border-outline/70 bg-chat-background leading-none">
                          ←→
                        </kbd>
                        <span>question</span>
                      </>
                    )
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">{primaryActionButton}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
