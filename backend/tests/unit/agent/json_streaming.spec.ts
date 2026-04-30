import { test } from '@japa/runner'
import {
  extractJsonObjectField,
  extractJsonStringArrayField,
  extractJsonStringField,
  extractJsonStringFieldAtPath,
  hasJsonFieldStarted,
} from '#agent/utils/json_streaming'

test.group('extractJsonStringField', () => {
  // Complete JSON scenarios
  test('extracts field from complete valid JSON', ({ assert }) => {
    assert.equal(extractJsonStringField('{"message": "Hello world"}', 'message'), 'Hello world')
  })

  test('extracts field from JSON with multiple fields', ({ assert }) => {
    const json = '{"path": "/src/app.ts", "command": "create", "file_text": "const x = 1"}'
    assert.equal(extractJsonStringField(json, 'path'), '/src/app.ts')
    assert.equal(extractJsonStringField(json, 'command'), 'create')
    assert.equal(extractJsonStringField(json, 'file_text'), 'const x = 1')
  })

  test('returns null for non-existent field in complete JSON', ({ assert }) => {
    assert.isNull(extractJsonStringField('{"other": "value"}', 'message'))
  })

  test('extracts empty string value', ({ assert }) => {
    assert.equal(extractJsonStringField('{"message": ""}', 'message'), '')
  })

  // Partial/streaming JSON scenarios
  test('extracts partial field value mid-stream', ({ assert }) => {
    assert.equal(extractJsonStringField('{"message": "Searching for retent', 'message'), 'Searching for retent')
  })

  test('extracts field when string is complete but JSON is not closed', ({ assert }) => {
    assert.equal(extractJsonStringField('{"message": "Complete message here"', 'message'), 'Complete message here')
  })

  test('returns null when field key has not started streaming', ({ assert }) => {
    assert.isNull(extractJsonStringField('{"oth', 'message'))
  })

  test('returns null when only field key is present, no value yet', ({ assert }) => {
    assert.isNull(extractJsonStringField('{"message":', 'message'))
  })

  test('returns empty string when value quote just started', ({ assert }) => {
    assert.equal(extractJsonStringField('{"message": "', 'message'), '')
  })

  // Escaped characters
  test('handles escaped newlines', ({ assert }) => {
    assert.equal(extractJsonStringField('{"thought": "Line 1\\nLine 2\\nLine 3"}', 'thought'), 'Line 1\nLine 2\nLine 3')
  })

  test('handles escaped quotes', ({ assert }) => {
    assert.equal(extractJsonStringField('{"message": "He said \\"hello\\""}', 'message'), 'He said "hello"')
  })

  test('handles escaped backslashes', ({ assert }) => {
    assert.equal(extractJsonStringField('{"path": "C:\\\\Users\\\\file.txt"}', 'path'), 'C:\\Users\\file.txt')
  })

  test('handles mixed escapes in partial JSON', ({ assert }) => {
    assert.equal(
      extractJsonStringField('{"file_text": "function test() {\\n  console.log(\\"hello', 'file_text'),
      'function test() {\n  console.log("hello'
    )
  })

  test('handles escaped tab characters', ({ assert }) => {
    assert.equal(extractJsonStringField('{"content": "col1\\tcol2\\tcol3"}', 'content'), 'col1\tcol2\tcol3')
  })

  test('handles literal backslash before n (not a newline)', ({ assert }) => {
    // JSON-escaped path C:\new_folder
    assert.equal(extractJsonStringField('{"path": "C:\\\\new_folder"}', 'path'), 'C:\\new_folder')
  })

  test('handles regex pattern with literal backslash-n', ({ assert }) => {
    // Source code containing /\n/ regex
    assert.equal(extractJsonStringField('{"file_text": "const re = /\\\\n/"}', 'file_text'), 'const re = /\\n/')
  })

  test('handles literal backslash before n in PARTIAL JSON (streaming)', ({ assert }) => {
    // Partial JSON - no closing quote, forces regex path
    // Path is C:\new_folder, in JSON that's "C:\\new_folder"
    // But we're mid-stream, so: {"path": "C:\\new_fol
    assert.equal(extractJsonStringField('{"path": "C:\\\\new_fol', 'path'), 'C:\\new_fol')
  })

  // Unicode
  test('handles unicode characters', ({ assert }) => {
    assert.equal(extractJsonStringField('{"message": "Hello 世界"}', 'message'), 'Hello 世界')
  })

  test('handles emoji', ({ assert }) => {
    assert.equal(extractJsonStringField('{"message": "Great job! 🎉"}', 'message'), 'Great job! 🎉')
  })

  // Edge cases
  test('handles whitespace variations in JSON', ({ assert }) => {
    assert.equal(extractJsonStringField('{ "message" :  "spaced out" }', 'message'), 'spaced out')
  })

  test('handles field at different positions', ({ assert }) => {
    assert.equal(extractJsonStringField('{"first": "1", "message": "target", "last": "3"}', 'message'), 'target')
  })

  test('returns null for null value', ({ assert }) => {
    assert.isNull(extractJsonStringField('{"message": null}', 'message'))
  })

  test('returns null for numeric value', ({ assert }) => {
    assert.isNull(extractJsonStringField('{"count": 42}', 'count'))
  })

  test('returns null for boolean value', ({ assert }) => {
    assert.isNull(extractJsonStringField('{"enabled": true}', 'enabled'))
  })

  test('returns null for empty input', ({ assert }) => {
    assert.isNull(extractJsonStringField('', 'message'))
  })

  test('returns null for malformed input', ({ assert }) => {
    assert.isNull(extractJsonStringField('not json at all', 'message'))
  })

  // Real-world streaming scenarios
  test('progress tool streaming - partial message', ({ assert }) => {
    assert.equal(
      extractJsonStringField('{"message": "Analyzing the codebase structure to find', 'message'),
      'Analyzing the codebase structure to find'
    )
  })

  test('think tool streaming - partial thought', ({ assert }) => {
    assert.equal(
      extractJsonStringField(
        '{"thought": "The user wants to refactor the authentication module. I should first',
        'thought'
      ),
      'The user wants to refactor the authentication module. I should first'
    )
  })

  test('str_replace_based_edit_tool - extracting path early', ({ assert }) => {
    const streaming = '{"command": "create", "path": "/src/utils/helper.ts", "file_text": "export function'
    assert.equal(extractJsonStringField(streaming, 'path'), '/src/utils/helper.ts')
    assert.equal(extractJsonStringField(streaming, 'command'), 'create')
  })

  test('web_search tool - extracting objective', ({ assert }) => {
    assert.equal(
      extractJsonStringField('{"objective": "best practices for React state management 2024', 'objective'),
      'best practices for React state management 2024'
    )
  })

  test('web_fetch tool - extracting objective', ({ assert }) => {
    assert.equal(
      extractJsonStringField('{"objective": "pricing comparison between', 'objective'),
      'pricing comparison between'
    )
  })
})

test.group('extractJsonStringArrayField', () => {
  test('extracts string arrays from complete JSON', ({ assert }) => {
    assert.deepEqual(
      extractJsonStringArrayField('{"urls": ["https://producthunt.com", "https://reddit.com"]}', 'urls'),
      ['https://producthunt.com', 'https://reddit.com']
    )
  })

  test('extracts partially streamed string arrays', ({ assert }) => {
    assert.deepEqual(extractJsonStringArrayField('{"urls": ["https://producthunt.com", "https://reddit.c', 'urls'), [
      'https://producthunt.com',
      'https://reddit.c',
    ])
  })

  test('returns null when the field is missing', ({ assert }) => {
    assert.isNull(extractJsonStringArrayField('{"objective": "hello"}', 'urls'))
  })
})

test.group('hasJsonFieldStarted', () => {
  test('detects field in complete JSON', ({ assert }) => {
    assert.isTrue(hasJsonFieldStarted('{"context": "A", "questions": []}', 'questions'))
  })

  test('detects field in partial JSON before value completes', ({ assert }) => {
    assert.isTrue(hasJsonFieldStarted('{"context": "A", "questions": [', 'questions'))
  })

  test('returns false when field is not present yet', ({ assert }) => {
    assert.isFalse(hasJsonFieldStarted('{"context": "A"', 'questions'))
  })

  test('returns false when field-like text appears inside quoted context string', ({ assert }) => {
    const partial = '{"context": "Literal \\\"questions\\\": [] appears in context"'
    assert.isFalse(hasJsonFieldStarted(partial, 'questions'))
  })

  test('returns false for empty input', ({ assert }) => {
    assert.isFalse(hasJsonFieldStarted('', 'questions'))
  })
})

test.group('extractJsonStringFieldAtPath', () => {
  test('extracts nested fields from complete JSON', ({ assert }) => {
    const json = '{"callId":"call_1","operation":{"type":"create_file","path":"notes.md","diff":"+hello"}}'

    assert.equal(extractJsonStringFieldAtPath(json, ['operation', 'type']), 'create_file')
    assert.equal(extractJsonStringFieldAtPath(json, ['operation', 'path']), 'notes.md')
    assert.equal(extractJsonStringFieldAtPath(json, ['operation', 'diff']), '+hello')
  })

  test('extracts nested fields from partial JSON', ({ assert }) => {
    const json = '{"callId":"call_1","operation":{"type":"update_file","path":"src/app.ts","diff":"@@\n-old\n+new'

    assert.equal(extractJsonStringFieldAtPath(json, ['operation', 'type']), 'update_file')
    assert.equal(extractJsonStringFieldAtPath(json, ['operation', 'path']), 'src/app.ts')
    assert.equal(extractJsonStringFieldAtPath(json, ['operation', 'diff']), '@@\n-old\n+new')
  })

  test('returns null for missing nested fields', ({ assert }) => {
    assert.isNull(extractJsonStringFieldAtPath('{"callId":"call_1"}', ['operation', 'path']))
  })
})

test.group('extractJsonObjectField', () => {
  test('extracts object from complete JSON', ({ assert }) => {
    assert.deepEqual(extractJsonObjectField('{"placement":{"type":"absolute","x":120,"y":240}}', 'placement'), {
      type: 'absolute',
      x: 120,
      y: 240,
    })
  })

  test('extracts object from partial JSON before later fields complete', ({ assert }) => {
    const json = '{"path":"notes.md","placement":{"type":"absolute","x":120,"y":240},"content":"# Tit'

    assert.deepEqual(extractJsonObjectField(json, 'placement'), {
      type: 'absolute',
      x: 120,
      y: 240,
    })
  })

  test('returns null when object has not closed yet', ({ assert }) => {
    const json = '{"placement":{"type":"relative","relation":"below","anchor_path":"notes/todo.md"'
    assert.isNull(extractJsonObjectField(json, 'placement'))
  })

  test('handles braces and quotes inside later string fields', ({ assert }) => {
    const json =
      '{"placement":{"type":"relative","relation":"below","anchor_path":"notes/todo.md"},"content":"literal { braces } and \\\"quotes\\\"'

    assert.deepEqual(extractJsonObjectField(json, 'placement'), {
      type: 'relative',
      relation: 'below',
      anchor_path: 'notes/todo.md',
    })
  })

  test('returns null for missing field', ({ assert }) => {
    assert.isNull(extractJsonObjectField('{"path":"notes.md"}', 'placement'))
  })
})
