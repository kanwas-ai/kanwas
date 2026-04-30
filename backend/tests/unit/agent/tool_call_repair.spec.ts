import { test } from '@japa/runner'
import { tool, type ModelMessage, type ToolSet } from 'ai'
import { z } from 'zod'
import { createToolCallReaskRepair } from '#agent/utils/tool_call_repair'

test.group('createToolCallReaskRepair', () => {
  test('repairs invalid tool calls with a single re-ask', async ({ assert }) => {
    const tools: ToolSet = {
      search: tool({
        description: 'Search docs',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => query,
      }),
    }

    let generateTextCallCount = 0
    let generateTextParams: any = null

    const repairToolCall = createToolCallReaskRepair({
      model: { id: 'fake-model' },
      tools,
      generateTextFn: (async (params: any) => {
        generateTextCallCount += 1
        generateTextParams = params
        return {
          toolCalls: [{ toolName: 'search', input: { query: 'fixed query' } }],
        }
      }) as any,
    })

    const result = await repairToolCall({
      toolCall: {
        toolCallId: 'tc-1',
        toolName: 'search',
        input: '{"query":',
      },
      error: new Error('Invalid tool input'),
      messages: [{ role: 'user', content: 'Find docs' } as ModelMessage],
      system: 'System prompt',
    })

    assert.deepEqual(result, {
      type: 'tool-call',
      toolCallId: 'tc-1',
      toolName: 'search',
      input: JSON.stringify({ query: 'fixed query' }),
    })

    assert.equal(generateTextCallCount, 1)
    assert.equal(generateTextParams.toolChoice, 'required')
    assert.lengthOf(generateTextParams.messages, 3)
    assert.equal(generateTextParams.messages[1].role, 'assistant')
    assert.equal(generateTextParams.messages[2].role, 'tool')
    assert.isUndefined((generateTextParams.tools.search as any).execute)
  })

  test('returns null after first failed re-ask for same tool call id', async ({ assert }) => {
    let generateTextCallCount = 0

    const repairToolCall = createToolCallReaskRepair({
      model: { id: 'fake-model' },
      tools: {
        search: tool({
          description: 'Search docs',
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => query,
        }),
      },
      generateTextFn: (async () => {
        generateTextCallCount += 1
        return {
          toolCalls: [],
        }
      }) as any,
    })

    const payload = {
      toolCall: {
        toolCallId: 'tc-2',
        toolName: 'search',
        input: '{"query":',
      },
      error: new Error('Invalid tool input'),
      messages: [{ role: 'user', content: 'Find docs' } as ModelMessage],
      system: 'System prompt',
    }

    const firstAttempt = await repairToolCall(payload)
    const secondAttempt = await repairToolCall(payload)

    assert.isNull(firstAttempt)
    assert.isNull(secondAttempt)
    assert.equal(generateTextCallCount, 1)
  })

  test('re-asks for invalid write_file structured tool calls', async ({ assert }) => {
    let generateTextCallCount = 0

    const repairToolCall = createToolCallReaskRepair({
      model: { id: 'fake-model' },
      tools: {
        write_file: tool({
          description: 'Create a file',
          inputSchema: z.object({
            path: z.string(),
            placement: z.object({
              type: z.literal('absolute'),
              x: z.number(),
              y: z.number(),
            }),
            content: z.string(),
          }),
          execute: async (input) => input,
        }),
      },
      generateTextFn: (async () => {
        generateTextCallCount += 1
        return {
          toolCalls: [
            {
              toolName: 'write_file',
              input: {
                path: 'hello.txt',
                placement: { type: 'absolute', x: 120, y: 240 },
                content: 'Hello',
              },
            },
          ],
        }
      }) as any,
    })

    const result = await repairToolCall({
      toolCall: {
        toolCallId: 'tc-write-file',
        toolName: 'write_file',
        input: 'File: hello.md\n    Hello',
      },
      error: new Error('Invalid tool input'),
      messages: [{ role: 'user', content: 'Create hello.txt' } as ModelMessage],
      system: 'System prompt',
    })

    assert.deepEqual(result, {
      type: 'tool-call',
      toolCallId: 'tc-write-file',
      toolName: 'write_file',
      input: JSON.stringify({
        path: 'hello.txt',
        placement: { type: 'absolute', x: 120, y: 240 },
        content: 'Hello',
      }),
    })
    assert.equal(generateTextCallCount, 1)
  })
})
