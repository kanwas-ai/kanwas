import type { ContextualLoggerContract } from '#contracts/contextual_logger'

const MAX_ERROR_PREVIEW_CHARS = 300

const SAFE_REQUEST_HEADER_NAMES = new Set([
  'accept',
  'content-type',
  'conversation_id',
  'openai-beta',
  'session_id',
  'user-agent',
  'x-client-request-id',
  'x-stainless-arch',
  'x-stainless-lang',
  'x-stainless-os',
  'x-stainless-package-version',
  'x-stainless-retry-count',
  'x-stainless-runtime',
  'x-stainless-runtime-version',
])

const SAFE_RESPONSE_HEADER_NAMES = new Set([
  'content-length',
  'content-type',
  'openai-processing-ms',
  'x-request-id',
  'x-ratelimit-limit-requests',
  'x-ratelimit-limit-tokens',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-requests',
  'x-ratelimit-reset-tokens',
])

type CounterMap = Record<string, number>

export function createOpenAILoggingFetch(logger: ContextualLoggerContract): typeof fetch {
  const requestLogger = logger.child({
    component: 'OpenAIProvider',
    llmApi: 'responses',
    llmProvider: 'openai',
    llmTransport: 'http',
  })

  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const request = new Request(input, init)
    const startedAt = Date.now()
    const requestSummary = await summarizeRequest(request)
    const requestLogFields = buildRequestLogFields(requestSummary)

    requestLogger.info(
      {
        event: 'openai_http_request',
        ...requestLogFields,
        request: requestSummary,
      },
      'Sending OpenAI HTTP request'
    )

    try {
      const response = await globalThis.fetch(request)
      const responseSummary = await summarizeResponse(response, startedAt)
      const responseLogFields = buildResponseLogFields(responseSummary)
      const requestContext = {
        method: requestSummary.method,
        model: requestSummary.model,
        url: requestSummary.url,
      }

      if (response.ok) {
        requestLogger.info(
          {
            event: 'openai_http_response',
            ...requestLogFields,
            ...responseLogFields,
            request: requestContext,
            response: responseSummary,
          },
          'Received OpenAI HTTP response'
        )
      } else {
        requestLogger.warn(
          {
            event: 'openai_http_response',
            ...requestLogFields,
            ...responseLogFields,
            request: requestContext,
            response: responseSummary,
          },
          'OpenAI HTTP request returned non-OK response'
        )
      }

      return response
    } catch (error) {
      requestLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          event: 'openai_http_request_failed',
          latencyMs: Date.now() - startedAt,
          ...requestLogFields,
          request: {
            method: requestSummary.method,
            model: requestSummary.model,
            url: requestSummary.url,
          },
        },
        'OpenAI HTTP request failed'
      )
      throw error
    }
  }
}

function buildRequestLogFields(requestSummary: Record<string, unknown>): Record<string, unknown> {
  const url = asRecord(requestSummary.url)
  const headers = asRecord(requestSummary.headers)
  const safeHeaders = asRecord(headers?.safeValues)
  const body = asRecord(requestSummary.body)
  const text = asRecord(body?.text)
  const reasoning = asRecord(body?.reasoning)
  const tools = asRecord(body?.tools)
  const input = asRecord(body?.input)
  const messages = asRecord(body?.messages)

  return compactLogFields({
    method: getString(requestSummary, 'method'),
    model: getString(requestSummary, 'model') ?? getString(body, 'model'),
    urlOrigin: getString(url, 'origin'),
    urlPathname: getString(url, 'pathname'),
    requestHeaderCount: getNumber(headers, 'count'),
    hasAuthorization: getBoolean(headers, 'hasAuthorization'),
    requestContentType: getString(safeHeaders, 'content-type'),
    conversationId: getString(safeHeaders, 'conversation_id'),
    clientRequestId: getString(safeHeaders, 'x-client-request-id'),
    requestBytes: getNumber(body, 'bytes'),
    stream: getBoolean(body, 'stream'),
    store: getBoolean(body, 'store'),
    textVerbosity: getString(text, 'verbosity'),
    textFormatType: getString(text, 'formatType'),
    reasoningEffort: getString(reasoning, 'effort'),
    reasoningSummary: getString(reasoning, 'summary'),
    maxOutputTokens: getNumber(body, 'maxOutputTokens'),
    toolChoice: summarizeTopLevelToolChoice(body?.toolChoice),
    toolCount: getNumber(tools, 'count'),
    conversationItemCount: getNumber(input, 'itemCount') ?? getNumber(messages, 'itemCount'),
    conversationTextLength: getNumber(input, 'textLength') ?? getNumber(messages, 'textLength'),
  })
}

function buildResponseLogFields(responseSummary: Record<string, unknown>): Record<string, unknown> {
  const headers = asRecord(responseSummary.headers)
  const safeHeaders = asRecord(headers?.safeValues)
  const errorBody = asRecord(responseSummary.errorBody)

  return compactLogFields({
    status: getNumber(responseSummary, 'status'),
    ok: getBoolean(responseSummary, 'ok'),
    statusText: getString(responseSummary, 'statusText'),
    latencyMs: getNumber(responseSummary, 'latencyMs'),
    responseHeaderCount: getNumber(headers, 'count'),
    responseContentType: getString(safeHeaders, 'content-type'),
    responseContentLength: getString(safeHeaders, 'content-length'),
    openaiRequestId: getString(safeHeaders, 'x-request-id'),
    openaiProcessingMs: getString(safeHeaders, 'openai-processing-ms'),
    rateLimitLimitRequests: getString(safeHeaders, 'x-ratelimit-limit-requests'),
    rateLimitLimitTokens: getString(safeHeaders, 'x-ratelimit-limit-tokens'),
    rateLimitRemainingRequests: getString(safeHeaders, 'x-ratelimit-remaining-requests'),
    rateLimitRemainingTokens: getString(safeHeaders, 'x-ratelimit-remaining-tokens'),
    rateLimitResetRequests: getString(safeHeaders, 'x-ratelimit-reset-requests'),
    rateLimitResetTokens: getString(safeHeaders, 'x-ratelimit-reset-tokens'),
    errorType: getString(errorBody, 'errorType'),
    errorCode: getString(errorBody, 'errorCode'),
    errorMessagePreview: getString(errorBody, 'messagePreview') ?? getString(errorBody, 'preview'),
  })
}

async function summarizeRequest(request: Request): Promise<Record<string, unknown>> {
  const bodyText = await safeReadRequestBody(request)
  const bodySummary = summarizeRequestBody(bodyText)

  return {
    method: request.method,
    url: summarizeUrl(request.url),
    headers: summarizeHeaders(request.headers, SAFE_REQUEST_HEADER_NAMES),
    ...(bodySummary ? { body: bodySummary } : {}),
    ...(typeof bodySummary?.model === 'string' ? { model: bodySummary.model } : {}),
  }
}

async function summarizeResponse(response: Response, startedAt: number): Promise<Record<string, unknown>> {
  return {
    headers: summarizeHeaders(response.headers, SAFE_RESPONSE_HEADER_NAMES),
    latencyMs: Date.now() - startedAt,
    ok: response.ok,
    status: response.status,
    ...(response.statusText ? { statusText: response.statusText } : {}),
    ...(!response.ok ? { errorBody: await summarizeErrorResponse(response) } : {}),
  }
}

function summarizeUrl(rawUrl: string): Record<string, unknown> {
  try {
    const url = new URL(rawUrl)
    return {
      origin: url.origin,
      pathname: url.pathname,
      ...(url.search ? { searchParamNames: [...url.searchParams.keys()].sort() } : {}),
    }
  } catch {
    return { raw: rawUrl }
  }
}

function summarizeHeaders(headers: Headers, safeHeaderNames: Set<string>): Record<string, unknown> {
  const names = [...headers.keys()].sort()
  const safeValues: Record<string, string> = {}

  for (const name of names) {
    if (!safeHeaderNames.has(name)) {
      continue
    }

    const value = headers.get(name)
    if (value !== null) {
      safeValues[name] = value
    }
  }

  return {
    count: names.length,
    hasAuthorization: headers.has('authorization'),
    names,
    ...(Object.keys(safeValues).length > 0 ? { safeValues } : {}),
  }
}

async function safeReadRequestBody(request: Request): Promise<string | undefined> {
  try {
    const text = await request.clone().text()
    return text || undefined
  } catch {
    return undefined
  }
}

function summarizeRequestBody(bodyText: string | undefined): Record<string, unknown> | undefined {
  if (!bodyText) {
    return undefined
  }

  const bytes = Buffer.byteLength(bodyText, 'utf8')

  try {
    const parsed = JSON.parse(bodyText)
    if (!isRecord(parsed)) {
      return {
        bytes,
        format: 'json',
        rootType: Array.isArray(parsed) ? 'array' : typeof parsed,
      }
    }

    const textOptions = asRecord(parsed.text)
    const textFormat = asRecord(textOptions?.format)
    const reasoning = asRecord(parsed.reasoning)

    return {
      bytes,
      format: 'json',
      topLevelKeys: Object.keys(parsed).sort(),
      ...(typeof parsed.model === 'string' ? { model: parsed.model } : {}),
      ...(typeof parsed.stream === 'boolean' ? { stream: parsed.stream } : {}),
      ...(typeof parsed.store === 'boolean' ? { store: parsed.store } : {}),
      ...(typeof parsed.instructions === 'string' ? { instructionsLength: parsed.instructions.length } : {}),
      ...(typeof parsed.prompt === 'string' ? { promptLength: parsed.prompt.length } : {}),
      ...(typeof parsed.max_output_tokens === 'number' ? { maxOutputTokens: parsed.max_output_tokens } : {}),
      ...(isRecord(parsed.metadata) ? { metadataKeys: Object.keys(parsed.metadata).sort() } : {}),
      ...(textOptions
        ? {
            text: {
              ...(typeof textOptions.verbosity === 'string' ? { verbosity: textOptions.verbosity } : {}),
              ...(typeof textFormat?.type === 'string' ? { formatType: textFormat.type } : {}),
              ...(typeof textFormat?.name === 'string' ? { formatName: textFormat.name } : {}),
              ...(isRecord(textFormat?.schema) ? { formatSchemaKeyCount: Object.keys(textFormat.schema).length } : {}),
            },
          }
        : {}),
      ...(reasoning
        ? {
            reasoning: {
              ...(typeof reasoning.effort === 'string' ? { effort: reasoning.effort } : {}),
              ...(typeof reasoning.summary === 'string' ? { summary: reasoning.summary } : {}),
            },
          }
        : {}),
      ...(parsed.tool_choice !== undefined ? { toolChoice: summarizeToolChoice(parsed.tool_choice) } : {}),
      ...(parsed.tools !== undefined ? { tools: summarizeTools(parsed.tools) } : {}),
      ...(parsed.input !== undefined ? { input: summarizeConversationItems(parsed.input) } : {}),
      ...(parsed.messages !== undefined ? { messages: summarizeConversationItems(parsed.messages) } : {}),
    }
  } catch {
    return {
      bytes,
      format: 'text',
    }
  }
}

function summarizeToolChoice(value: unknown): Record<string, unknown> | string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (!isRecord(value)) {
    return undefined
  }

  const fn = asRecord(value.function)
  return {
    ...(typeof value.type === 'string' ? { type: value.type } : {}),
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(typeof fn?.name === 'string' ? { functionName: fn.name } : {}),
  }
}

function summarizeTopLevelToolChoice(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  const toolChoice = asRecord(value)
  if (!toolChoice) {
    return undefined
  }

  const type = getString(toolChoice, 'type')
  const name = getString(toolChoice, 'name') ?? getString(toolChoice, 'functionName')
  if (!type && !name) {
    return undefined
  }

  return [type, name].filter(Boolean).join(':')
}

function summarizeTools(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const typeCounts: CounterMap = {}
  const names: string[] = []
  let strictCount = 0

  for (const tool of value) {
    if (!isRecord(tool)) {
      continue
    }

    const type = typeof tool.type === 'string' ? tool.type : 'unknown'
    incrementCounter(typeCounts, type)

    if (typeof tool.name === 'string' && names.length < 20) {
      names.push(tool.name)
    }

    if (tool.strict === true) {
      strictCount += 1
    }
  }

  return {
    count: value.length,
    ...(Object.keys(typeCounts).length > 0 ? { typeCounts } : {}),
    ...(names.length > 0 ? { names } : {}),
    ...(strictCount > 0 ? { strictCount } : {}),
  }
}

function summarizeConversationItems(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    return {
      itemCount: 1,
      kind: 'string',
      textLength: value.length,
    }
  }

  if (!Array.isArray(value)) {
    return undefined
  }

  const roleCounts: CounterMap = {}
  const itemTypeCounts: CounterMap = {}
  const contentPartTypeCounts: CounterMap = {}
  let textLength = 0
  let toolArgumentLength = 0
  let toolOutputLength = 0
  let filePartCount = 0
  let imagePartCount = 0
  let audioPartCount = 0

  for (const item of value) {
    if (typeof item === 'string') {
      textLength += item.length
      continue
    }

    if (!isRecord(item)) {
      continue
    }

    if (typeof item.role === 'string') {
      incrementCounter(roleCounts, item.role)
    }

    if (typeof item.type === 'string') {
      incrementCounter(itemTypeCounts, item.type)
    }

    if (typeof item.content === 'string') {
      textLength += item.content.length
    }

    if (Array.isArray(item.content)) {
      for (const part of item.content) {
        if (typeof part === 'string') {
          textLength += part.length
          continue
        }

        if (!isRecord(part)) {
          continue
        }

        const partType = typeof part.type === 'string' ? part.type : 'unknown'
        incrementCounter(contentPartTypeCounts, partType)

        if (typeof part.text === 'string') {
          textLength += part.text.length
        }

        if (typeof part.input_text === 'string') {
          textLength += part.input_text.length
        }

        if (typeof part.output_text === 'string') {
          textLength += part.output_text.length
        }

        if (partType.includes('file')) {
          filePartCount += 1
        }

        if (partType.includes('image')) {
          imagePartCount += 1
        }

        if (partType.includes('audio')) {
          audioPartCount += 1
        }
      }
    }

    if (typeof item.arguments === 'string') {
      toolArgumentLength += item.arguments.length
    }

    if (typeof item.output === 'string') {
      toolOutputLength += item.output.length
    }
  }

  return {
    itemCount: value.length,
    kind: 'array',
    ...(Object.keys(roleCounts).length > 0 ? { roleCounts } : {}),
    ...(Object.keys(itemTypeCounts).length > 0 ? { itemTypeCounts } : {}),
    ...(Object.keys(contentPartTypeCounts).length > 0 ? { contentPartTypeCounts } : {}),
    ...(textLength > 0 ? { textLength } : {}),
    ...(toolArgumentLength > 0 ? { toolArgumentLength } : {}),
    ...(toolOutputLength > 0 ? { toolOutputLength } : {}),
    ...(filePartCount > 0 ? { filePartCount } : {}),
    ...(imagePartCount > 0 ? { imagePartCount } : {}),
    ...(audioPartCount > 0 ? { audioPartCount } : {}),
  }
}

async function summarizeErrorResponse(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    const text = await response.clone().text()
    if (!text) {
      return undefined
    }

    const bytes = Buffer.byteLength(text, 'utf8')

    try {
      const parsed = JSON.parse(text)
      if (!isRecord(parsed)) {
        return {
          bytes,
          format: 'json',
          rootType: Array.isArray(parsed) ? 'array' : typeof parsed,
        }
      }

      const error = asRecord(parsed.error)
      const message =
        typeof error?.message === 'string' ? error.message : typeof parsed.message === 'string' ? parsed.message : text

      return {
        bytes,
        format: 'json',
        topLevelKeys: Object.keys(parsed).sort(),
        ...(typeof error?.type === 'string' ? { errorType: error.type } : {}),
        ...(typeof error?.code === 'string' ? { errorCode: error.code } : {}),
        messagePreview: truncate(message, MAX_ERROR_PREVIEW_CHARS),
      }
    } catch {
      return {
        bytes,
        format: 'text',
        preview: truncate(text, MAX_ERROR_PREVIEW_CHARS),
      }
    }
  } catch {
    return undefined
  }
}

function incrementCounter(counter: CounterMap, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`
}

function compactLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}

function getString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

function getNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' ? value : undefined
}

function getBoolean(record: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = record?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
