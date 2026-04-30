import { test } from '@japa/runner'
import { EventStream, State } from '#agent/index'
import { ASK_QUESTION_WAITING_FOR_USER, askQuestionTool } from '#agent/tools/ask_question'
import type { AgentEvent } from '#agent/events'

function createInput() {
  return {
    context: 'Need one quick decision.',
    questions: [
      {
        id: 'q1',
        text: 'Which file should I update?',
        multiSelect: false,
        options: [
          {
            id: 'notes',
            label: 'notes.md',
            description: 'Update the notes file.',
          },
          {
            id: 'readme',
            label: 'README.md',
            description: 'Update the README instead.',
          },
        ],
      },
    ],
  }
}

function createExecContext() {
  const eventStream = new EventStream()
  const state = new State(eventStream)
  const events: AgentEvent[] = []
  const calls: string[] = []

  eventStream.on('agent_event', (event: AgentEvent) => {
    events.push(event)
  })

  const execContext = {
    experimental_context: {
      state,
      eventStream,
      sandboxManager: {
        pause: async () => {
          calls.push('pause')
        },
        resume: async () => {
          calls.push('resume')
        },
      },
      agent: { source: 'main' as const },
    },
    toolCallId: 'tool-call-1',
  }

  return { state, events, calls, execContext }
}

test.group('askQuestionTool handoff lifecycle', () => {
  test('creates a pending question without blocking on sandbox pause', async ({ assert }) => {
    const { state, events, calls, execContext } = createExecContext()

    const result = await (askQuestionTool as any).execute(createInput(), execContext)
    const item = state.getTimeline()[0]

    assert.equal(result, ASK_QUESTION_WAITING_FOR_USER)
    assert.equal(item?.type, 'ask_question')
    assert.deepInclude(item as object, {
      status: 'pending',
    })
    assert.deepEqual(calls, [])
    assert.deepEqual(
      events.map((event) => event.type),
      ['ask_question_created']
    )
  })
})
