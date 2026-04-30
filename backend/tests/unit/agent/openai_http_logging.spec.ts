import { test } from '@japa/runner'
import sinon from 'sinon'
import { createOpenAILoggingFetch } from '#agent/providers/openai_logging'
import { ContextualLogger } from '#services/contextual_logger'

class MockLogger {
  public calls: Array<{ level: string; args: unknown[] }> = []
  private bindings: Record<string, unknown> = {}

  info(...args: unknown[]) {
    this.calls.push({ level: 'info', args })
  }

  warn(...args: unknown[]) {
    this.calls.push({ level: 'warn', args })
  }

  error(...args: unknown[]) {
    this.calls.push({ level: 'error', args })
  }

  debug(...args: unknown[]) {
    this.calls.push({ level: 'debug', args })
  }

  child(bindings: Record<string, unknown>) {
    const child = new MockLogger()
    child.calls = this.calls
    child.bindings = { ...this.bindings, ...bindings }
    return child
  }
}

test.group('openai http logging fetch', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('logs request structure without raw prompt content', async ({ assert }) => {
    const mockLogger = new MockLogger()
    const logger = new ContextualLogger(mockLogger as any, { correlationId: 'corr-123' })
    const wrappedFetch = createOpenAILoggingFetch(logger)

    sinon.stub(globalThis, 'fetch').resolves(
      new Response(JSON.stringify({ id: 'resp_123' }), {
        status: 200,
        headers: {
          'content-length': '18',
          'content-type': 'application/json',
          'openai-processing-ms': '321',
          'x-ratelimit-remaining-requests': '4999',
          'x-request-id': 'req_123',
        },
      })
    )

    const systemText = 'System prompt that should not be logged verbatim.'
    const userText = 'User prompt that should not be logged verbatim.'
    const toolOutput = 'Tool output that should not be logged verbatim.'

    const requestBody = {
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemText }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: userText }],
        },
        {
          type: 'function_call_output',
          output: toolOutput,
        },
      ],
      instructions: 'Follow the system messages provided in the conversation.',
      model: 'gpt-5.4',
      reasoning: { effort: 'high', summary: 'auto' },
      store: false,
      stream: true,
      text: { verbosity: 'low' },
      tool_choice: 'auto',
      tools: [{ type: 'function', name: 'read_file', strict: true }],
    }

    await wrappedFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer secret-token',
        'Content-Type': 'application/json',
        'conversation_id': 'lane-123',
        'x-client-request-id': 'req-client-123',
      },
      body: JSON.stringify(requestBody),
    })

    const requestLog = mockLogger.calls.find((call) => (call.args[0] as any)?.event === 'openai_http_request')
    const responseLog = mockLogger.calls.find((call) => (call.args[0] as any)?.event === 'openai_http_response')

    assert.exists(requestLog)
    assert.exists(responseLog)
    assert.equal(requestLog?.level, 'info')
    assert.equal(responseLog?.level, 'info')

    const requestPayload = requestLog?.args[0] as any
    assert.equal(requestPayload.method, 'POST')
    assert.equal(requestPayload.model, 'gpt-5.4')
    assert.equal(requestPayload.urlOrigin, 'https://api.openai.com')
    assert.equal(requestPayload.urlPathname, '/v1/responses')
    assert.equal(requestPayload.requestHeaderCount, 4)
    assert.equal(requestPayload.hasAuthorization, true)
    assert.equal(requestPayload.requestContentType, 'application/json')
    assert.equal(requestPayload.conversationId, 'lane-123')
    assert.equal(requestPayload.clientRequestId, 'req-client-123')
    assert.equal(requestPayload.stream, true)
    assert.equal(requestPayload.store, false)
    assert.equal(requestPayload.textVerbosity, 'low')
    assert.equal(requestPayload.reasoningEffort, 'high')
    assert.equal(requestPayload.reasoningSummary, 'auto')
    assert.equal(requestPayload.toolChoice, 'auto')
    assert.equal(requestPayload.toolCount, 1)
    assert.equal(requestPayload.conversationItemCount, 3)
    assert.equal(requestPayload.request.method, 'POST')
    assert.equal(requestPayload.request.url.origin, 'https://api.openai.com')
    assert.equal(requestPayload.request.url.pathname, '/v1/responses')
    assert.equal(requestPayload.request.model, 'gpt-5.4')
    assert.equal(requestPayload.request.headers.hasAuthorization, true)
    assert.notProperty(requestPayload.request.headers.safeValues, 'authorization')
    assert.equal(requestPayload.request.headers.safeValues['content-type'], 'application/json')
    assert.equal(requestPayload.request.headers.safeValues['conversation_id'], 'lane-123')
    assert.equal(requestPayload.request.body.text.verbosity, 'low')
    assert.equal(requestPayload.request.body.reasoning.effort, 'high')
    assert.equal(requestPayload.request.body.reasoning.summary, 'auto')
    assert.equal(requestPayload.request.body.instructionsLength, requestBody.instructions.length)
    assert.equal(requestPayload.request.body.input.itemCount, 3)
    assert.equal(requestPayload.request.body.input.roleCounts.system, 1)
    assert.equal(requestPayload.request.body.input.roleCounts.user, 1)
    assert.equal(requestPayload.request.body.input.contentPartTypeCounts.input_text, 2)
    assert.equal(requestPayload.request.body.input.toolOutputLength, toolOutput.length)
    assert.deepEqual(requestPayload.request.body.tools.names, ['read_file'])
    assert.notInclude(JSON.stringify(requestPayload), systemText)
    assert.notInclude(JSON.stringify(requestPayload), userText)

    const responsePayload = responseLog?.args[0] as any
    assert.equal(responsePayload.method, 'POST')
    assert.equal(responsePayload.model, 'gpt-5.4')
    assert.equal(responsePayload.status, 200)
    assert.equal(responsePayload.ok, true)
    assert.equal(responsePayload.responseContentType, 'application/json')
    assert.equal(responsePayload.responseContentLength, '18')
    assert.equal(responsePayload.openaiRequestId, 'req_123')
    assert.equal(responsePayload.openaiProcessingMs, '321')
    assert.equal(responsePayload.rateLimitRemainingRequests, '4999')
    assert.equal(responsePayload.response.status, 200)
    assert.equal(responsePayload.response.ok, true)
    assert.equal(responsePayload.response.headers.safeValues['x-request-id'], 'req_123')
  })

  test('logs non-ok responses with a structured error preview', async ({ assert }) => {
    const mockLogger = new MockLogger()
    const logger = new ContextualLogger(mockLogger as any, { correlationId: 'corr-456' })
    const wrappedFetch = createOpenAILoggingFetch(logger)

    sinon.stub(globalThis, 'fetch').resolves(
      new Response(
        JSON.stringify({
          error: {
            code: 'bad_request',
            message: 'Invalid text verbosity setting',
            type: 'invalid_request_error',
          },
        }),
        {
          status: 400,
          headers: {
            'content-length': '102',
            'content-type': 'application/json',
            'openai-processing-ms': '45',
            'x-request-id': 'req_400',
          },
        }
      )
    )

    await wrappedFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.4', text: { verbosity: 'low' } }),
    })

    const responseLog = mockLogger.calls.find(
      (call) => call.level === 'warn' && (call.args[0] as any)?.event === 'openai_http_response'
    )

    assert.exists(responseLog)

    const payload = responseLog?.args[0] as any
    assert.equal(payload.method, 'POST')
    assert.equal(payload.model, 'gpt-5.4')
    assert.equal(payload.response.status, 400)
    assert.equal(payload.status, 400)
    assert.equal(payload.ok, false)
    assert.equal(payload.responseContentType, 'application/json')
    assert.equal(payload.responseContentLength, '102')
    assert.equal(payload.openaiRequestId, 'req_400')
    assert.equal(payload.openaiProcessingMs, '45')
    assert.equal(payload.errorType, 'invalid_request_error')
    assert.equal(payload.errorCode, 'bad_request')
    assert.equal(payload.errorMessagePreview, 'Invalid text verbosity setting')
    assert.equal(payload.response.errorBody.errorType, 'invalid_request_error')
    assert.equal(payload.response.errorBody.errorCode, 'bad_request')
    assert.equal(payload.response.errorBody.messagePreview, 'Invalid text verbosity setting')
  })
})
