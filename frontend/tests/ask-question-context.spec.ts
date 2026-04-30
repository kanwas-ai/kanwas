import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AskQuestionItem } from 'backend/agent'

const voiceInputMock = vi.hoisted(() => ({
  isRecording: false,
  isTranscribing: false,
  isSupported: true,
  toggleRecording: vi.fn(),
  onTranscript: null as ((text: string) => void) | null,
}))

vi.mock('@/hooks/useVoiceInput', () => ({
  useVoiceInput: ({ onTranscript }: { onTranscript: (text: string) => void }) => {
    voiceInputMock.onTranscript = onTranscript
    return {
      isRecording: voiceInputMock.isRecording,
      isTranscribing: voiceInputMock.isTranscribing,
      isSupported: voiceInputMock.isSupported,
      toggleRecording: voiceInputMock.toggleRecording,
      analyserRef: { current: null },
    }
  },
}))

import { AskQuestion } from '@/components/chat/AskQuestion'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createAskQuestionItem(overrides: Partial<AskQuestionItem> = {}): AskQuestionItem {
  return {
    id: 'ask-question-1',
    type: 'ask_question',
    context: 'Please confirm rollout expectations before we continue.',
    questions: [],
    status: 'pending',
    timestamp: Date.now(),
    ...overrides,
  }
}

function createPendingQuestionItem(overrides: Partial<AskQuestionItem> = {}): AskQuestionItem {
  return createAskQuestionItem({
    context: undefined,
    questions: [
      {
        id: 'q1',
        text: 'Which direction should we take?',
        multiSelect: false,
        options: [
          { id: 'fast', label: 'Fast', description: 'Optimize for speed' },
          { id: 'careful', label: 'Careful', description: 'Optimize for quality' },
        ],
      },
    ],
    ...overrides,
  })
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  valueSetter?.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

function clickOtherOption(container: HTMLElement) {
  const otherLabel = Array.from(container.querySelectorAll('span')).find((el) => el.textContent === 'Other')
  expect(otherLabel).toBeTruthy()
  otherLabel?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('AskQuestion context rendering', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    voiceInputMock.isRecording = false
    voiceInputMock.isTranscribing = false
    voiceInputMock.isSupported = true
    voiceInputMock.toggleRecording.mockReset()
    voiceInputMock.onTranscript = null

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await act(async () => {
      root.unmount()
    })
    document.body.innerHTML = ''
  })

  it('renders streamed context as terminal-style content (without chat bubble wrapper)', async () => {
    const item = createAskQuestionItem()

    await act(async () => {
      root.render(
        React.createElement(AskQuestion, {
          item,
          isPending: false,
          onAnswer: () => undefined,
          streaming: true,
        })
      )
    })

    expect(container.textContent).toContain('Please confirm rollout expectations before we continue.')
    expect(container.querySelector('.bg-chat-pill')).toBeNull()
  })

  it('opens the Other answer as a multiline textarea', async () => {
    await act(async () => {
      root.render(
        React.createElement(AskQuestion, {
          item: createPendingQuestionItem(),
          isPending: false,
          onAnswer: () => undefined,
        })
      )
    })

    await act(async () => {
      clickOtherOption(container)
      await Promise.resolve()
    })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null
    expect(textarea).toBeTruthy()
    expect(textarea?.rows).toBe(2)
    expect(textarea?.placeholder).toBe('Type your answer...')
  })

  it('renders voice status as an overlay on top of the Other textarea', async () => {
    voiceInputMock.isTranscribing = true

    await act(async () => {
      root.render(
        React.createElement(AskQuestion, {
          item: createPendingQuestionItem(),
          isPending: false,
          onAnswer: () => undefined,
        })
      )
    })

    await act(async () => {
      clickOtherOption(container)
      await Promise.resolve()
    })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null
    const overlay = textarea?.parentElement?.querySelector('[aria-label="Voice input overlay"]')
    expect(overlay).toBeTruthy()
    expect(overlay?.textContent).toContain('Transcribing...')
  })

  it('renders the Other mic as a solid direct-hover button', async () => {
    await act(async () => {
      root.render(
        React.createElement(AskQuestion, {
          item: createPendingQuestionItem(),
          isPending: false,
          onAnswer: () => undefined,
        })
      )
    })

    await act(async () => {
      clickOtherOption(container)
      await Promise.resolve()
    })

    const micButton = container.querySelector('button[aria-label="Voice input"]')
    expect(micButton?.classList.contains('group')).toBe(false)
    expect(micButton?.querySelector('.fa-solid.fa-microphone')).toBeTruthy()
    expect(micButton?.querySelector('.fa-regular.fa-microphone')).toBeNull()
  })

  it('submits multiline Other text with the existing answer prefix', async () => {
    const onAnswer = vi.fn()

    await act(async () => {
      root.render(
        React.createElement(AskQuestion, {
          item: createPendingQuestionItem(),
          isPending: false,
          onAnswer,
        })
      )
    })

    await act(async () => {
      clickOtherOption(container)
      await Promise.resolve()
    })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      setTextareaValue(textarea, 'line 1\nline 2')
    })

    const confirmButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Confirm')
    )
    expect(confirmButton).toBeTruthy()

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onAnswer).toHaveBeenCalledWith('ask-question-1', { q1: ['__other__:line 1\nline 2'] })
  })

  it('submits Other text from the selected checkmark action', async () => {
    const onAnswer = vi.fn()

    await act(async () => {
      root.render(
        React.createElement(AskQuestion, {
          item: createPendingQuestionItem(),
          isPending: false,
          onAnswer,
        })
      )
    })

    await act(async () => {
      clickOtherOption(container)
      await Promise.resolve()
    })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      setTextareaValue(textarea, 'submit from check')
    })

    const checkButton = container.querySelector('button[aria-label="Confirm answer"]')
    expect(checkButton).toBeTruthy()

    await act(async () => {
      checkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onAnswer).toHaveBeenCalledWith('ask-question-1', { q1: ['__other__:submit from check'] })
  })

  it('keeps plain Enter inside the Other textarea instead of submitting', async () => {
    const onAnswer = vi.fn()

    await act(async () => {
      root.render(
        React.createElement(AskQuestion, {
          item: createPendingQuestionItem(),
          isPending: false,
          onAnswer,
        })
      )
    })

    await act(async () => {
      clickOtherOption(container)
      await Promise.resolve()
    })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })

    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('uses Cmd+Enter in the Other textarea to submit the current answer', async () => {
    const onAnswer = vi.fn()

    await act(async () => {
      root.render(
        React.createElement(AskQuestion, {
          item: createPendingQuestionItem(),
          isPending: false,
          onAnswer,
        })
      )
    })

    await act(async () => {
      clickOtherOption(container)
      await Promise.resolve()
    })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      setTextareaValue(textarea, 'custom direction')
    })

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true })
      )
    })

    expect(onAnswer).toHaveBeenCalledWith('ask-question-1', { q1: ['__other__:custom direction'] })
  })

  it('uses Ctrl+Enter in the Other textarea to advance to the next question', async () => {
    const onAnswer = vi.fn()
    const item = createPendingQuestionItem({
      questions: [
        {
          id: 'q1',
          text: 'Which direction should we take?',
          multiSelect: false,
          options: [
            { id: 'fast', label: 'Fast', description: 'Optimize for speed' },
            { id: 'careful', label: 'Careful', description: 'Optimize for quality' },
          ],
        },
        {
          id: 'q2',
          text: 'Who should review it?',
          multiSelect: false,
          options: [
            { id: 'team', label: 'Team', description: 'Ask the team' },
            { id: 'lead', label: 'Lead', description: 'Ask the lead' },
          ],
        },
      ],
    })

    await act(async () => {
      root.render(
        React.createElement(AskQuestion, {
          item,
          isPending: false,
          onAnswer,
        })
      )
    })

    await act(async () => {
      clickOtherOption(container)
      await Promise.resolve()
    })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
      )
    })

    expect(onAnswer).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Who should review it?')
  })

  it('appends voice transcript text to the selected Other textarea', async () => {
    await act(async () => {
      root.render(
        React.createElement(AskQuestion, {
          item: createPendingQuestionItem(),
          isPending: false,
          onAnswer: () => undefined,
        })
      )
    })

    await act(async () => {
      clickOtherOption(container)
      await Promise.resolve()
    })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      setTextareaValue(textarea, 'Existing answer')
    })

    await act(async () => {
      voiceInputMock.onTranscript?.('Spoken answer')
    })

    expect(textarea.value).toBe('Existing answer\nSpoken answer')
  })
})
