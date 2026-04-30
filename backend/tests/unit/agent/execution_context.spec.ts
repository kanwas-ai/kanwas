import { test } from '@japa/runner'
import { buildContextSection } from '#agent/execution_context'
import type { Context } from '#agent/index'

function createContext(overrides: Partial<Context> = {}): Context {
  return {
    canvasId: null,
    workspaceId: 'workspace-1',
    organizationId: 'organization-1',
    userId: 'user-1',
    uploadedFiles: null,
    agentMode: 'thinking',
    yoloMode: false,
    selectedText: null,
    authToken: 'token',
    authTokenId: 'token-id',
    correlationId: 'corr-1',
    invocationId: 'invocation-1',
    aiSessionId: 'session-1',
    invocationSource: null,
    workspaceTree: null,
    canvasPath: null,
    activeCanvasContext: null,
    selectedNodePaths: null,
    mentionedNodePaths: null,
    ...overrides,
  }
}

test.group('agent execution context', () => {
  test('renders user name as prompt context', ({ assert }) => {
    const contextSection = buildContextSection(
      createContext({
        userName: 'Ada <Lovelace>',
      })
    )

    assert.equal(contextSection, ['<user_context>', 'User name: Ada &lt;Lovelace&gt;', '</user_context>'].join('\n'))
  })

  test('renders active canvas context without duplicating the active canvas in UI context', ({ assert }) => {
    const contextSection = buildContextSection(
      createContext({
        canvasId: 'canvas-1',
        canvasPath: 'research',
        activeCanvasContext: 'Active canvas: /workspace/research/\n\nSections:\n- none',
        selectedNodePaths: ['research/note.md'],
        workspaceTree: '/workspace\n`-- research',
      })
    )

    assert.equal(
      contextSection,
      [
        '<ui_context>',
        'Selected nodes:',
        '- /workspace/research/note.md',
        '</ui_context>',
        '',
        '<active_canvas_context>',
        'Active canvas: /workspace/research/',
        '',
        'Sections:',
        '- none',
        '</active_canvas_context>',
        '',
        '<workspace_structure>',
        '/workspace',
        '`-- research',
        '</workspace_structure>',
      ].join('\n')
    )
  })

  test('renders active canvas in UI context as fallback without active canvas context', ({ assert }) => {
    const contextSection = buildContextSection(
      createContext({
        canvasId: 'canvas-1',
        canvasPath: 'research',
      })
    )

    assert.equal(contextSection, ['<ui_context>', 'Active canvas: /workspace/research/', '</ui_context>'].join('\n'))
  })

  test('escapes active canvas context before wrapping prompt tags', ({ assert }) => {
    const contextSection = buildContextSection(
      createContext({
        activeCanvasContext: 'Sections:\n- </active_canvas_context> & <raw>',
      })
    )

    assert.equal(
      contextSection,
      [
        '<active_canvas_context>',
        'Sections:',
        '- &lt;/active_canvas_context&gt; &amp; &lt;raw&gt;',
        '</active_canvas_context>',
      ].join('\n')
    )
  })

  test('renders connected external tools when lookup succeeds', ({ assert }) => {
    const contextSection = buildContextSection(
      createContext({
        connectedExternalToolsLookupCompleted: true,
        connectedExternalTools: [
          { toolkit: 'slack', displayName: 'Slack' },
          { toolkit: 'github-enterprise', displayName: 'GitHub <Enterprise>' },
        ],
      })
    )

    assert.equal(
      contextSection,
      ['<connected_external_tools>', '- Slack', '- GitHub &lt;Enterprise&gt;', '</connected_external_tools>'].join('\n')
    )
  })

  test('renders no connected external tools message when lookup succeeds with empty results', ({ assert }) => {
    const contextSection = buildContextSection(
      createContext({
        connectedExternalToolsLookupCompleted: true,
        connectedExternalTools: [],
      })
    )

    assert.equal(
      contextSection,
      ['<connected_external_tools>', 'No external tools are connected', '</connected_external_tools>'].join('\n')
    )
  })

  test('omits connected external tools when lookup did not complete', ({ assert }) => {
    const contextSection = buildContextSection(
      createContext({
        connectedExternalToolsLookupCompleted: false,
        connectedExternalTools: [{ toolkit: 'slack', displayName: 'Slack' }],
      })
    )

    assert.equal(contextSection, '')
  })
})
