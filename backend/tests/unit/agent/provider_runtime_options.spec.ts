import { test } from '@japa/runner'
import { applyRuntimeProviderOptions, buildOpenAIThreadContext } from '#agent/providers/runtime_options'

test.group('provider runtime options', () => {
  test('adds a stable per-lane OpenAI promptCacheKey at request level', ({ assert }) => {
    const threadContext = buildOpenAIThreadContext({
      providerName: 'openai',
      workspaceId: 'workspace-123',
      aiSessionId: 'session-456',
      modelId: 'gpt-5.4',
      agentSource: 'main',
      flowName: 'product-agent',
    })

    const options = applyRuntimeProviderOptions({
      providerName: 'openai',
      baseOptions: {
        openai: {
          reasoningEffort: 'high',
          reasoningSummary: 'auto',
        },
      },
      workspaceId: 'workspace-123',
      aiSessionId: 'session-456',
      modelId: 'gpt-5.4',
      agentSource: 'main',
      flowName: 'product-agent',
    })

    assert.equal(options.openai?.reasoningEffort, 'high')
    assert.equal(options.openai?.reasoningSummary, 'auto')
    assert.equal(options.openai?.promptCacheKey, threadContext?.providerLaneKey)
    assert.isAtMost(threadContext?.providerLaneKey.length ?? 0, 64)
  })

  test('builds stable thread headers for main agent lane', ({ assert }) => {
    const threadContext = buildOpenAIThreadContext({
      providerName: 'openai',
      workspaceId: 'workspace-123',
      aiSessionId: 'session-456',
      modelId: 'gpt-5.4',
      agentSource: 'main',
      flowName: 'product-agent',
    })

    assert.equal(
      threadContext?.laneId,
      'kanwas|workspace:workspace-123|thread:session-456|flow:product-agent|lane:main'
    )
    assert.match(threadContext?.providerLaneKey ?? '', /^kwlane_v1_[A-Za-z0-9_-]+$/)
    assert.isAtMost(threadContext?.providerLaneKey.length ?? 0, 64)
    assert.deepEqual(threadContext?.headers, {
      'conversation_id': threadContext?.providerLaneKey,
      'session_id': threadContext?.providerLaneKey,
      'x-client-request-id': threadContext?.providerLaneKey,
    })
  })

  test('builds stable thread headers for subagent lane', ({ assert }) => {
    const threadContext = buildOpenAIThreadContext({
      providerName: 'openai',
      workspaceId: 'workspace-123',
      aiSessionId: 'session-456',
      modelId: 'gpt-5.4-mini',
      agentSource: 'subagent',
      flowName: 'product-agent',
      agentType: 'explore',
    })

    assert.equal(
      threadContext?.laneId,
      'kanwas|workspace:workspace-123|thread:session-456|flow:product-agent|lane:subagent:explore'
    )
    assert.match(threadContext?.providerLaneKey ?? '', /^kwlane_v1_[A-Za-z0-9_-]+$/)
    assert.isAtMost(threadContext?.providerLaneKey.length ?? 0, 64)
    assert.deepEqual(threadContext?.headers, {
      'conversation_id': threadContext?.providerLaneKey,
      'session_id': threadContext?.providerLaneKey,
      'x-client-request-id': threadContext?.providerLaneKey,
    })
  })

  test('leaves non-OpenAI provider options unchanged', ({ assert }) => {
    const options = applyRuntimeProviderOptions({
      providerName: 'anthropic',
      baseOptions: {
        anthropic: {
          thinking: { type: 'adaptive' },
        },
      },
      workspaceId: 'workspace-123',
      aiSessionId: 'session-456',
      modelId: 'claude-sonnet-4-6',
      agentSource: 'main',
    })

    assert.deepEqual(options, {
      anthropic: {
        thinking: { type: 'adaptive' },
      },
    })
  })
})
