import { test } from '@japa/runner'
import { CanvasAgent } from '#agent/index'
import { createAnthropicProvider } from '#agent/providers/index'
import { startTaskTool } from '#agent/tools/start_task'

const mockProvider = createAnthropicProvider('test-key')

function createResolvedFlow() {
  const definition = CanvasAgent.getProductAgentFlowDefinition('test-model', mockProvider)

  return CanvasAgent.resolveInvocationFlow({
    definition,
    mainSystemPrompts: ['MAIN'],
    subagentPromptByName: {
      explore: 'EXPLORE',
      external: 'EXTERNAL',
    },
    provider: mockProvider,
  })
}

test.group('start_task flow-driven dispatch', () => {
  test('uses the default subagent from resolved flow when agent_type is omitted', async ({ assert }) => {
    const flow = createResolvedFlow()
    const timelineItems: any[] = []
    const timelineUpdates: any[] = []

    const runSubagentCalls: any[] = []
    const llm = {
      runSubagent: async (input: any) => {
        runSubagentCalls.push(input)
        return { response: 'Subagent output', iterations: 3 }
      },
    }

    const state = {
      currentContext: {
        workspaceTree: 'root/\n  note.md\n',
      },
      addTimelineItem: (item: any) => {
        timelineItems.push(item)
        return 'timeline-1'
      },
      updateTimelineItem: (id: string, updates: any) => {
        timelineUpdates.push({ id, updates })
      },
    }

    const context = {
      state,
      llm,
      flow,
    }

    const result = await (startTaskTool as any).execute(
      {
        task_description: 'Inspect workspace structure',
        task_objective: 'Find where onboarding docs live',
      },
      {
        experimental_context: context,
        toolCallId: 'tool-call-1',
      }
    )

    assert.equal(runSubagentCalls.length, 1)
    assert.equal(runSubagentCalls[0].agentType, 'explore')
    assert.equal(runSubagentCalls[0].workspaceTree, 'root/\n  note.md\n')
    assert.equal(timelineItems[0].agentType, 'explore')
    assert.equal(timelineItems[0].model, 'medium')
    assert.equal(timelineUpdates[0].updates.status, 'completed')
    assert.include(result, '## Task Complete')
    assert.include(result, 'Subagent output')
  })

  test('rejects unknown agent_type using resolved flow metadata', async ({ assert }) => {
    const flow = createResolvedFlow()
    const runSubagentCalls: any[] = []

    const context = {
      state: {
        currentContext: {
          workspaceTree: null,
        },
        addTimelineItem: () => 'timeline-1',
        updateTimelineItem: () => undefined,
      },
      llm: {
        runSubagent: async (input: any) => {
          runSubagentCalls.push(input)
          return { response: 'should not run', iterations: 1 }
        },
      },
      flow,
    }

    const result = await (startTaskTool as any).execute(
      {
        task_description: 'Do something',
        task_objective: 'Do something detailed',
        agent_type: 'unknown-agent',
      },
      {
        experimental_context: context,
        toolCallId: 'tool-call-2',
      }
    )

    assert.equal(runSubagentCalls.length, 0)
    assert.include(result, 'Invalid agent_type')
    assert.include(result, 'explore')
    assert.include(result, 'external')
  })
})
