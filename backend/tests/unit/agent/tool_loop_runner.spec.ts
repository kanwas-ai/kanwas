import { test } from '@japa/runner'
import sinon from 'sinon'
import { ToolLoopAgent } from 'ai'
import { runToolLoop } from '#agent/tool_loop_runner'

test.group('tool loop runner', (group) => {
  let streamStub: sinon.SinonStub
  let capturedMaxOutputTokens: number | undefined
  let capturedHeaders: Record<string, string> | undefined

  group.each.setup(() => {
    capturedMaxOutputTokens = undefined
    capturedHeaders = undefined
  })

  group.each.teardown(() => {
    streamStub?.restore()
  })

  test('calls onError when post-stream result collection fails', async ({ assert }) => {
    const expectedError = new Error('steps failed')
    const onError = sinon.spy()

    streamStub = sinon.stub(ToolLoopAgent.prototype, 'stream').callsFake(async () => {
      return {
        fullStream: (async function* () {})(),
        response: Promise.resolve({ messages: [] }),
        steps: Promise.reject(expectedError),
      } as any
    })

    await assert.rejects(
      () =>
        runToolLoop({
          model: {},
          tools: {},
          messages: [{ role: 'user', content: 'hi' } as any],
          stopWhen: [],
          context: {
            abortSignal: undefined,
            posthogService: {},
            traceIdentity: {},
            traceContext: {},
          } as any,
          onError,
        }),
      'steps failed'
    )

    assert.isTrue(onError.calledOnce)
    assert.equal(onError.firstCall.firstArg, expectedError)
  })

  test('passes maxOutputTokens to ToolLoopAgent', async ({ assert }) => {
    streamStub = sinon.stub(ToolLoopAgent.prototype, 'stream').callsFake(async function (this: any) {
      capturedMaxOutputTokens = this?.settings?.maxOutputTokens
      capturedHeaders = this?.settings?.headers

      return {
        fullStream: (async function* () {})(),
        response: Promise.resolve({ messages: [] }),
        steps: Promise.resolve([]),
      } as any
    })

    await runToolLoop({
      model: {},
      tools: {},
      messages: [{ role: 'user', content: 'hi' } as any],
      headers: {
        'conversation_id': 'lane-main',
        'session_id': 'lane-main',
        'x-client-request-id': 'lane-main',
      },
      maxOutputTokens: 800,
      stopWhen: [],
      context: {
        abortSignal: undefined,
        posthogService: {},
        traceIdentity: {},
        traceContext: {},
      } as any,
    })

    assert.equal(capturedMaxOutputTokens, 800)
    assert.deepEqual(capturedHeaders, {
      'conversation_id': 'lane-main',
      'session_id': 'lane-main',
      'x-client-request-id': 'lane-main',
    })
  })
})
