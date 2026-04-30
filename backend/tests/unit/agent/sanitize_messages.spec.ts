import { test } from '@japa/runner'
import type { ModelMessage } from 'ai'
import { sanitizeToolCallInputs } from '#agent/llm/sanitize_messages'

test.group('sanitizeToolCallInputs', () => {
  test('preserves raw string input for write_file custom tool calls', ({ assert }) => {
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc-write-file',
            toolName: 'write_file',
            input: 'File: hello.md\n    Hello',
          },
        ],
      } as any,
    ]

    const sanitized = sanitizeToolCallInputs(messages)

    assert.deepEqual(sanitized, messages)
  })

  test('parses JSON string input for schema-based tool calls', ({ assert }) => {
    const sanitized = sanitizeToolCallInputs([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc-search',
            toolName: 'search',
            input: '{"query":"hello"}',
          },
        ],
      } as any,
    ])

    assert.deepEqual(sanitized, [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc-search',
            toolName: 'search',
            input: { query: 'hello' },
          },
        ],
      },
    ])
  })

  test('drops orphaned tool-call and its paired tool-result when tool is not registered', ({ assert }) => {
    const known = new Set(['write_file'])
    const sanitized = sanitizeToolCallInputs(
      [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Applying patch.' },
            {
              type: 'tool-call',
              toolCallId: 'tc-apply',
              toolName: 'apply_patch',
              input: '*** Begin Patch\n…',
              providerMetadata: { openai: { itemId: 'ctc_abc' } },
            },
          ],
        } as any,
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'tc-apply',
              toolName: 'apply_patch',
              output: { type: 'text', value: 'ok' },
            },
          ],
        } as any,
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Done.' }],
        } as any,
      ],
      known
    )

    assert.deepEqual(sanitized, [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Applying patch.' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
      },
    ])
  })

  test('drops assistant message entirely when the only part was an orphaned tool-call', ({ assert }) => {
    const sanitized = sanitizeToolCallInputs(
      [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'tc-old',
              toolName: 'removed_tool',
              input: {},
            },
          ],
        } as any,
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'tc-old',
              toolName: 'removed_tool',
              output: { type: 'text', value: 'irrelevant' },
            },
          ],
        } as any,
      ],
      new Set(['write_file'])
    )

    assert.deepEqual(sanitized, [])
  })

  test('keeps tool-call when it is in the known tool set', ({ assert }) => {
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc-write-file',
            toolName: 'write_file',
            input: 'File: hello.md\n    Hello',
          },
        ],
      } as any,
    ]

    const sanitized = sanitizeToolCallInputs(messages, new Set(['write_file']))

    assert.deepEqual(sanitized, messages)
  })
})
