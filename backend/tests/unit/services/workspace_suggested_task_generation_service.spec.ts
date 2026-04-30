import { test } from '@japa/runner'
import sinon from 'sinon'
import app from '@adonisjs/core/services/app'
import { ZodError } from 'zod'
import User from '#models/user'
import { createTestWorkspace } from '#tests/helpers/workspace'
import WorkspaceSuggestedTaskGenerationService, {
  WorkspaceSuggestedTaskGenerationError,
} from '#services/workspace_suggested_task_generation_service'
import { LLM } from '#agent/llm'
import { WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME } from '#agent/flow'
import { fakeSandboxRegistry } from '#tests/mocks/sandbox_registry'

test.group('WorkspaceSuggestedTaskGenerationService', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('normalizes structured output and cleans up the background invocation sandbox', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-generate@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggested Generator Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskGenerationService)

    const generateStub = sinon.stub(LLM.prototype, 'generateWithTools').resolves({
      messages: [],
      iterations: 3,
      toolResults: [
        {
          toolName: WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME,
          input: null,
          output: {
            tasks: [
              {
                id: 'Explore kickoff docs',
                emoji: '🧭',
                headline: '  Explore kickoff docs  ',
                description: ' Review the seeded docs and note the most important open questions. ',
                prompt: ' Read the key workspace docs and summarize the best next steps for the team. ',
              },
            ],
          },
        },
      ],
      isTerminal: false,
      textOutput: undefined,
    })
    sinon.stub(LLM.prototype, 'closeSession').resolves()

    const tasks = await service.generateForWorkspace({
      workspaceId: workspace.id,
      triggeringUserId: user.id,
      correlationId: 'suggested-task-test',
    })

    assert.lengthOf(tasks, 1)
    assert.equal(tasks[0].emoji, '🧭')
    assert.equal(tasks[0].headline, 'Explore kickoff docs')
    assert.equal(tasks[0].description, 'Review the seeded docs and note the most important open questions.')
    assert.equal(tasks[0].prompt, 'Read the key workspace docs and summarize the best next steps for the team.')
    assert.match(tasks[0].id, /^explore-kickoff-docs-/)

    assert.isFalse(await fakeSandboxRegistry.hasInvocationForWorkspace(workspace.id))
    assert.isTrue(generateStub.calledOnce)
  })

  test('fails when the terminal suggested-task tool is not returned', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-missing-terminal@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Missing Terminal Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskGenerationService)

    sinon.stub(LLM.prototype, 'generateWithTools').resolves({
      messages: [],
      iterations: 1,
      toolResults: [
        {
          toolName: 'progress',
          input: null,
          output: null,
        },
      ],
      isTerminal: false,
      textOutput: undefined,
    })
    sinon.stub(LLM.prototype, 'closeSession').resolves()

    try {
      await service.generateForWorkspace({
        workspaceId: workspace.id,
        triggeringUserId: user.id,
        correlationId: 'suggested-task-missing-terminal-test',
      })
      assert.fail('Expected suggested task generation to throw')
    } catch (error) {
      const wrappedError = error as WorkspaceSuggestedTaskGenerationError

      assert.instanceOf(wrappedError, WorkspaceSuggestedTaskGenerationError)
      assert.instanceOf(wrappedError.cause, Error)
      assert.equal((wrappedError.cause as Error).message, 'Agent completed without a final assistant message')
    }

    assert.isFalse(await fakeSandboxRegistry.hasInvocationForWorkspace(workspace.id))
  })

  test('truncates overlong prompts to the final 900 character limit', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-long-prompt@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Long Prompt Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskGenerationService)
    const longPrompt = 'A'.repeat(1200)

    sinon.stub(LLM.prototype, 'generateWithTools').resolves({
      messages: [],
      iterations: 2,
      toolResults: [
        {
          toolName: WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME,
          input: null,
          output: {
            tasks: [
              {
                id: 'long-prompt-task',
                emoji: '🧪',
                headline: 'Stress-test prompt length handling',
                description: 'Ensure the service trims verbose model output without failing the whole run.',
                prompt: longPrompt,
              },
            ],
          },
        },
      ],
      isTerminal: false,
      textOutput: undefined,
    })
    sinon.stub(LLM.prototype, 'closeSession').resolves()

    const tasks = await service.generateForWorkspace({
      workspaceId: workspace.id,
      triggeringUserId: user.id,
      correlationId: 'suggested-task-long-prompt-test',
    })

    assert.lengthOf(tasks, 1)
    assert.lengthOf(tasks[0].prompt, 900)
    assert.equal(tasks[0].prompt, longPrompt.slice(0, 900))
    assert.isFalse(await fakeSandboxRegistry.hasInvocationForWorkspace(workspace.id))
  })

  test('rejects empty suggested task payloads', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-empty-payload@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Empty Suggested Payload Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskGenerationService)

    sinon.stub(LLM.prototype, 'generateWithTools').resolves({
      messages: [],
      iterations: 1,
      toolResults: [
        {
          toolName: WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME,
          input: null,
          output: {
            tasks: [],
          },
        },
      ],
      isTerminal: false,
      textOutput: undefined,
    })
    sinon.stub(LLM.prototype, 'closeSession').resolves()

    try {
      await service.generateForWorkspace({
        workspaceId: workspace.id,
        triggeringUserId: user.id,
        correlationId: 'suggested-task-empty-payload-test',
      })
      assert.fail('Expected empty suggested task payload to be rejected')
    } catch (error) {
      const wrappedError = error as WorkspaceSuggestedTaskGenerationError

      assert.instanceOf(wrappedError, WorkspaceSuggestedTaskGenerationError)
      assert.instanceOf(wrappedError.cause, ZodError)
    }

    assert.isFalse(await fakeSandboxRegistry.hasInvocationForWorkspace(workspace.id))
  })
})
