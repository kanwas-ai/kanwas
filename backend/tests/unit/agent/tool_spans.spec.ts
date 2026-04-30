import { test } from '@japa/runner'
import { captureToolCallSpansFromSteps } from '#agent/tracing/tool_spans'

test.group('captureToolCallSpansFromSteps', () => {
  test('does not mark successful string output as an error', ({ assert }) => {
    const spans: Array<Record<string, unknown>> = []
    const posthogService = {
      captureAiSpan: (payload: Record<string, unknown>) => {
        spans.push(payload)
      },
    }

    captureToolCallSpansFromSteps({
      posthogService: posthogService as any,
      traceIdentity: {
        distinctId: 'user-1',
        workspaceId: 'workspace-1',
        organizationId: 'organization-1',
        invocationId: 'invocation-1',
        correlationId: 'correlation-1',
      },
      traceContext: {
        traceId: 'trace-1',
        sessionId: 'session-1',
      },
      steps: [
        {
          toolCalls: [
            {
              toolName: 'ask_question',
              toolCallId: 'tool-1',
              input: {
                questions: [{ text: 'Which file?' }],
              },
            },
          ],
          toolResults: [
            {
              output: 'Q: Which file?\nA: instructions.md',
            },
          ],
        },
      ],
    })

    assert.lengthOf(spans, 1)
    assert.equal(spans[0].status, 'completed')
    assert.equal(spans[0].isError, false)
    assert.isUndefined(spans[0].error)
    assert.equal(spans[0].output, 'Q: Which file?\nA: instructions.md')
  })

  test('marks failed tool calls with explicit error text', ({ assert }) => {
    const spans: Array<Record<string, unknown>> = []
    const posthogService = {
      captureAiSpan: (payload: Record<string, unknown>) => {
        spans.push(payload)
      },
    }

    captureToolCallSpansFromSteps({
      posthogService: posthogService as any,
      traceIdentity: {
        distinctId: 'user-1',
        workspaceId: 'workspace-1',
        organizationId: 'organization-1',
        invocationId: 'invocation-1',
        correlationId: 'correlation-1',
      },
      traceContext: {
        traceId: 'trace-1',
        sessionId: 'session-1',
      },
      steps: [
        {
          toolCalls: [
            {
              toolName: 'str_replace_based_edit_tool',
              toolCallId: 'tool-2',
              input: {
                command: 'view',
                path: '/workspace/missing.md',
              },
            },
          ],
          toolResults: [
            {
              isError: true,
              errorText: 'File does not exist: /workspace/missing.md',
            },
          ],
        },
      ],
    })

    assert.lengthOf(spans, 1)
    assert.equal(spans[0].status, 'failed')
    assert.equal(spans[0].isError, true)
    assert.equal(spans[0].error, 'File does not exist: /workspace/missing.md')
  })
})
