import { test } from '@japa/runner'
import sinon from 'sinon'
import User from '#models/user'
import Invocation from '#models/invocation'
import Task from '#models/task'
import AgentInvoked from '#events/agent_invoked'
import { ASK_QUESTION_WAITING_FOR_USER } from '#agent/tools/ask_question'
import { createTestWorkspace } from '#tests/helpers/workspace'

const QUESTION_ITEM_ID = 'ask-question-1'

function createPendingQuestionState(invocationId: string) {
  const question = {
    id: 'q1',
    text: 'Which file should I update?',
    multiSelect: false,
    options: [
      {
        id: 'notes',
        label: 'notes.md',
        description: 'Update notes.',
      },
      {
        id: 'readme',
        label: 'README.md',
        description: 'Update README.',
      },
    ],
  }

  return {
    event: {
      type: 'ask_question_created',
      itemId: QUESTION_ITEM_ID,
      timestamp: Date.now(),
    },
    state: {
      provider: 'openai',
      messages: [
        {
          role: 'user',
          content: 'Need a file decision',
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: QUESTION_ITEM_ID,
              toolName: 'ask_question',
              input: {
                questions: [question],
              },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: QUESTION_ITEM_ID,
              toolName: 'ask_question',
              output: ASK_QUESTION_WAITING_FOR_USER,
            },
          ],
        },
      ],
      timeline: [
        {
          id: 'user-message-1',
          type: 'user_message',
          message: 'Need a file decision',
          timestamp: Date.now(),
          invocationId,
        },
        {
          id: QUESTION_ITEM_ID,
          type: 'ask_question',
          context: 'Need one quick decision.',
          questions: [question],
          status: 'pending',
          timestamp: Date.now(),
          agent: { source: 'main' },
        },
      ],
    },
  }
}

test.group('Agent invocations - answer question', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('answers the existing question card and resumes the same invocation', async ({ client, assert }) => {
    const dispatchStub = sinon.stub(AgentInvoked, 'dispatch').resolves()
    const user = await User.create({
      email: 'answer-question@example.com',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Answer Question Workspace')

    const parentInvocation = await Invocation.create({
      query: 'Need a file decision',
      agentState: null,
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      mode: 'thinking',
    })

    parentInvocation.agentState = createPendingQuestionState(parentInvocation.id) as any
    await parentInvocation.save()

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: parentInvocation.id,
      latestInvocationId: parentInvocation.id,
      status: 'waiting',
      title: 'Question task',
      description: parentInvocation.query,
      modifiedFolders: [],
    })

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const response = await client
      .post(`/agent/invocations/${parentInvocation.id}/questions/${QUESTION_ITEM_ID}/answer`)
      .bearerToken(loginResponse.body().value)
      .json({
        answers: {
          q1: ['notes'],
        },
        workspace_tree: '/workspace\n`-- notes.md',
      })

    response.assertStatus(200)

    await parentInvocation.refresh()
    await task.refresh()

    assert.equal(response.body().invocationId, parentInvocation.id)
    assert.equal(response.body().taskId, task.id)
    assert.equal(task.latestInvocationId, parentInvocation.id)
    assert.equal(task.status, 'processing')
    assert.isTrue(dispatchStub.calledOnce)
    assert.equal(dispatchStub.firstCall.args[0].id, parentInvocation.id)

    const responseTimeline = response.body().state.state.timeline
    assert.lengthOf(
      responseTimeline.filter((item: any) => item.type === 'user_message'),
      1
    )
    assert.deepInclude(
      responseTimeline.find((item: any) => item.id === QUESTION_ITEM_ID),
      {
        status: 'answered',
        answers: { q1: ['notes'] },
      }
    )

    const toolResult = (parentInvocation.agentState?.state.messages as any[])[2].content[0]
    assert.equal(toolResult.output, ASK_QUESTION_WAITING_FOR_USER)

    const hiddenAnswerMessage = (parentInvocation.agentState?.state.messages as any[]).at(-1)
    assert.equal(hiddenAnswerMessage.role, 'user')
    assert.include(hiddenAnswerMessage.content, 'Q: Which file should I update?\nA: notes.md')
    assert.equal(parentInvocation.agentState?.event.type, 'ask_question_answered')
    assert.isNull(parentInvocation.agentStartedAt)
  })

  test('rejects an already answered question', async ({ client }) => {
    const user = await User.create({
      email: 'already-answered-question@example.com',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Already Answered Question Workspace')

    const invocation = await Invocation.create({
      query: 'Need a file decision',
      agentState: null,
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      mode: 'thinking',
    })

    const state = createPendingQuestionState(invocation.id) as any
    state.state.timeline[1].status = 'answered'
    state.state.timeline[1].answers = { q1: ['notes'] }
    invocation.agentState = state
    await invocation.save()

    await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocation.id,
      latestInvocationId: invocation.id,
      status: 'waiting',
      title: 'Question task',
      description: invocation.query,
      modifiedFolders: [],
    })

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const response = await client
      .post(`/agent/invocations/${invocation.id}/questions/${QUESTION_ITEM_ID}/answer`)
      .bearerToken(loginResponse.body().value)
      .json({
        answers: {
          q1: ['notes'],
        },
      })

    response.assertStatus(409)
  })
})
