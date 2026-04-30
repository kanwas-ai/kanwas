import type { HttpContext } from '@adonisjs/core/http'
import mime from 'mime'
import { invokeValidator, CommandSchema, answerQuestionValidator } from '#validators/agent_invocation'
import Invocation from '#models/invocation'
import type { UploadedFile } from '#models/invocation'
import Workspace from '#models/workspace'
import AgentInvoked from '#events/agent_invoked'
import InvocationCompleted from '#events/invocation_completed'
import Organization from '#models/organization'
import { DEFAULT_LLM_PROVIDER } from 'shared/llm-config'
import { randomUUID } from 'node:crypto'
import { createEventContext } from '#contracts/event_context'
import { authorizeWorkspaceAccess } from '#policies/organization_authorization'
import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import TaskLifecycleService, {
  EditableTaskNotFoundError,
  TaskEditInProgressError,
} from '#services/task_lifecycle_service'
import TaskTitleService from '#services/task_title_service'
import AgentCommandService from '#services/agent_command_service'
import AgentRuntimeService from '#services/agent_runtime_service'
import OrganizationUsageService, { type OrganizationUsageLimitGateResult } from '#services/organization_usage_service'
import UserConfigService from '#services/user_config_service'
import { moveMultipartFileToDisk } from '#services/multipart_file'
import type { AgentSocketMessage } from '#types/socketio'
import type { SerializedState } from '#agent/index'
import { DEFAULT_AGENT_MODE, normalizeAgentMode } from '#agent/modes'
import Task from '#models/task'
import { formatAnswersForLLM } from '#agent/tools/ask_question'
import type { AskQuestionItem, ConversationItem, Question } from '#agent/types'
import type { ModelMessage } from 'ai'
import { WORKSPACE_ONBOARDING_PROMPT, WORKSPACE_ONBOARDING_TASK_DESCRIPTION } from '#types/workspace_onboarding'

type PersistEditContext = {
  taskId: string
  editedInvocationId: string
}

type PersistInvocationAndTaskParams = {
  invocation: Invocation
  parentInvocation: Invocation | null
  rootInvocationId: string
  rootDescription: string
  workspaceId: string
  userId: string
  query: string
  editContext?: PersistEditContext
}

type QuestionAnswerErrorReason = 'missing_state' | 'question_not_found' | 'question_already_resolved'

class QuestionAnswerError extends Error {
  constructor(public reason: QuestionAnswerErrorReason) {
    super(reason)
  }
}

class WorkspaceOnboardingStartError extends Error {
  constructor(public readonly onboardingStatus: string) {
    super('Workspace onboarding cannot be started')
    this.name = 'WorkspaceOnboardingStartError'
  }
}

@inject()
export default class AgentInvocationsController {
  constructor(
    private taskLifecycleService: TaskLifecycleService,
    private taskTitleService: TaskTitleService,
    private agentCommandService: AgentCommandService,
    private agentRuntimeService: AgentRuntimeService,
    private organizationUsageService: OrganizationUsageService,
    private userConfigService: UserConfigService
  ) {}

  private buildPersistEditContext(
    editedTask: Task | null,
    editedInvocation: Invocation | null
  ): PersistEditContext | undefined {
    if (!editedTask || !editedInvocation) {
      return undefined
    }

    return {
      taskId: editedTask.id,
      editedInvocationId: editedInvocation.id,
    }
  }

  private async persistInvocationAndTask(params: PersistInvocationAndTaskParams): Promise<{
    taskId: string
    taskCreated: boolean
  }> {
    let taskId: string | null = null
    let taskCreated = false

    await db.transaction(async (trx) => {
      params.invocation.useTransaction(trx)
      await params.invocation.save()

      const result = params.editContext
        ? await this.taskLifecycleService.rebranchTaskFromEditedInvocation(
            {
              taskId: params.editContext.taskId,
              editedInvocationId: params.editContext.editedInvocationId,
              invocationId: params.invocation.id,
              workspaceId: params.workspaceId,
              userId: params.userId,
            },
            { client: trx }
          )
        : params.parentInvocation
          ? await this.taskLifecycleService.attachFollowUpInvocation(
              {
                workspaceId: params.workspaceId,
                userId: params.userId,
                rootInvocationId: params.rootInvocationId,
                invocationId: params.invocation.id,
                description: params.rootDescription,
              },
              { client: trx }
            )
          : await this.taskLifecycleService.createTaskForNewInvocation(
              {
                workspaceId: params.workspaceId,
                userId: params.userId,
                invocationId: params.invocation.id,
                description: params.query,
              },
              { client: trx }
            )

      taskId = result.task.id
      taskCreated = result.created
    })

    if (!taskId) {
      throw new Error('Task creation failed during invocation transaction')
    }

    return { taskId, taskCreated }
  }

  private async persistInvocationAndTaskOrRespond(
    response: HttpContext['response'],
    params: PersistInvocationAndTaskParams,
    editedTaskId?: string
  ) {
    try {
      return {
        ok: true as const,
        ...(await this.persistInvocationAndTask(params)),
      }
    } catch (error) {
      if (error instanceof EditableTaskNotFoundError) {
        return {
          ok: false as const,
          response: response.badRequest({ error: 'Invalid edited invocation id' }),
        }
      }

      if (error instanceof TaskEditInProgressError) {
        return {
          ok: false as const,
          response: response.conflict({
            error: 'Cannot edit while this task is running',
            taskId: editedTaskId,
          }),
        }
      }

      throw error
    }
  }

  private normalizeSerializedState(
    parentState: AgentSocketMessage['state'] | null | undefined,
    provider: SerializedState['provider']
  ): SerializedState {
    const messages =
      'messages' in (parentState ?? {})
        ? this.cloneMessages((parentState?.messages as SerializedState['messages']) ?? [])
        : [
            ...this.cloneMessages(
              ((parentState as SerializedState | null | undefined)?.anthropicMessages as SerializedState['messages']) ??
                []
            ),
          ]

    return {
      provider: parentState?.provider ?? provider,
      messages,
      timeline: Array.isArray(parentState?.timeline)
        ? (parentState.timeline.map((item) => ({ ...item })) as SerializedState['timeline'])
        : [],
    }
  }

  private cloneMessages(messages: SerializedState['messages'] | undefined): ModelMessage[] {
    return (messages ?? []).map((message) => ({
      ...message,
      content: Array.isArray(message.content)
        ? message.content.map((part) => (part && typeof part === 'object' ? { ...part } : part))
        : message.content,
    })) as ModelMessage[]
  }

  private isAskQuestionItem(item: ConversationItem | undefined): item is AskQuestionItem {
    return item?.type === 'ask_question'
  }

  private applyQuestionAnswerToState(params: {
    parentState: AgentSocketMessage['state'] | null | undefined
    itemId: string
    answers: Record<string, string[]>
    provider: SerializedState['provider']
  }): AgentSocketMessage {
    if (!params.parentState) {
      throw new QuestionAnswerError('missing_state')
    }

    const state = this.normalizeSerializedState(params.parentState, params.provider)
    const itemIndex = state.timeline.findIndex((item) => item.id === params.itemId)
    const item = state.timeline[itemIndex]

    if (!this.isAskQuestionItem(item)) {
      throw new QuestionAnswerError('question_not_found')
    }

    if (item.status !== 'pending') {
      throw new QuestionAnswerError('question_already_resolved')
    }

    const isSkipped = Object.values(params.answers).every((answerIds) => answerIds.length === 0)
    const formattedAnswer = formatAnswersForLLM(item.questions as Question[], params.answers)
    const answeredItem: AskQuestionItem = {
      ...item,
      status: isSkipped ? 'skipped' : 'answered',
      answers: params.answers,
    }

    state.timeline[itemIndex] = answeredItem

    state.messages = [
      ...(state.messages ?? []),
      {
        role: 'user',
        content: `The user answered the pending ask_question card (${params.itemId}).\n\n${formattedAnswer}`,
      } as ModelMessage,
    ]

    const timestamp = Date.now()
    return {
      event: {
        type: 'ask_question_answered',
        itemId: params.itemId,
        timestamp,
      },
      state,
    }
  }

  private buildBlockedQuestionAnswerState(params: {
    parentState: AgentSocketMessage['state']
    gateResult: OrganizationUsageLimitGateResult
    provider: SerializedState['provider']
  }): AgentSocketMessage {
    const now = Date.now()
    const errorItemId = `${now}_error`
    const state = this.normalizeSerializedState(params.parentState, params.provider)

    state.timeline.push({
      id: errorItemId,
      type: 'error',
      error: {
        code: 'OUT_OF_USAGE_LIMIT',
        message:
          params.gateResult.message ?? 'Your organization has reached its current usage limit. Please try again later.',
        timestamp: now,
      },
      timestamp: now,
    })

    return {
      event: {
        type: 'error',
        itemId: errorItemId,
        timestamp: now,
      },
      state,
    }
  }

  private buildBlockedInvocationState(params: {
    invocationId: string
    gateResult: OrganizationUsageLimitGateResult
    query: string
    parentState: AgentSocketMessage['state'] | null | undefined
    provider: SerializedState['provider']
  }): AgentSocketMessage {
    const now = Date.now()
    const userMessageId = `${now}_user_message`
    const errorItemId = `${now}_error`
    const state = this.normalizeSerializedState(params.parentState, params.provider)

    state.timeline.push({
      id: userMessageId,
      type: 'user_message',
      message: params.query,
      timestamp: now,
      invocationId: params.invocationId,
    })

    state.timeline.push({
      id: errorItemId,
      type: 'error',
      error: {
        code: 'OUT_OF_USAGE_LIMIT',
        message:
          params.gateResult.message ?? 'Your organization has reached its current usage limit. Please try again later.',
        timestamp: now,
      },
      timestamp: now,
    })

    return {
      event: {
        type: 'error',
        itemId: errorItemId,
        timestamp: now,
      },
      state,
    }
  }

  private isTaskRunning(task: Task): boolean {
    return task.status === 'initiated' || task.status === 'processing' || task.status === 'waiting'
  }

  async startOnboarding({ params, auth, response, organizationId }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id

    if (!organizationId) {
      return response.badRequest({ error: 'Workspace context is required' })
    }

    const currentWorkspace = await Workspace.query()
      .select('id', 'onboarding_status')
      .where('id', workspaceId)
      .firstOrFail()
    if (currentWorkspace.onboardingStatus !== 'not_started') {
      return response.conflict({
        error: 'Workspace onboarding is not available',
        onboardingStatus: currentWorkspace.onboardingStatus,
      })
    }

    const organization = await Organization.findOrFail(organizationId)
    const gateResult = await this.organizationUsageService.evaluateLimitGate(organization)
    const userConfig = await this.userConfigService.getConfig(user.id)
    const serializedProvider = userConfig.llmProvider ?? DEFAULT_LLM_PROVIDER
    const invocationId = randomUUID()

    if (gateResult.blocked) {
      const blockedInvocation = new Invocation().fill({
        id: invocationId,
        workspaceId,
        canvasId: null,
        query: WORKSPACE_ONBOARDING_PROMPT,
        agentState: this.buildBlockedInvocationState({
          invocationId,
          gateResult,
          query: WORKSPACE_ONBOARDING_TASK_DESCRIPTION,
          parentState: null,
          provider: serializedProvider,
        }),
        parentInvocationId: null,
        files: null,
        yoloMode: false,
        mode: DEFAULT_AGENT_MODE,
        userId: user.id,
        source: 'onboarding',
      })

      const persistResult = await this.persistInvocationAndTaskOrRespond(response, {
        invocation: blockedInvocation,
        parentInvocation: null,
        rootInvocationId: invocationId,
        rootDescription: WORKSPACE_ONBOARDING_TASK_DESCRIPTION,
        workspaceId,
        userId: user.id,
        query: WORKSPACE_ONBOARDING_TASK_DESCRIPTION,
      })

      if (!persistResult.ok) {
        return persistResult.response
      }

      await this.taskLifecycleService.markInvocationTerminal(blockedInvocation.id, 'error')

      InvocationCompleted.dispatch(
        {
          invocationId: blockedInvocation.id,
          workspaceId,
          organizationId,
          userId: user.id,
          blocked: true,
        },
        createEventContext({ userId: user.id, workspaceId, organizationId })
      )

      return {
        invocationId: blockedInvocation.id,
        taskId: persistResult.taskId,
        state: blockedInvocation.agentState,
        onboardingStatus: 'not_started' as const,
        blocked: {
          reason: gateResult.message,
          resetAtUtc: gateResult.resetAtUtc?.toISO() ?? null,
          blockedPeriodTypes: gateResult.blockedPeriodTypes,
        },
      }
    }

    const invocation = new Invocation().fill({
      id: invocationId,
      workspaceId,
      canvasId: null,
      query: WORKSPACE_ONBOARDING_PROMPT,
      agentState: null,
      parentInvocationId: null,
      files: null,
      yoloMode: false,
      mode: DEFAULT_AGENT_MODE,
      userId: user.id,
      source: 'onboarding',
    })

    let taskId: string | null = null
    let taskCreated = false

    try {
      await db.transaction(async (trx) => {
        const workspace = await Workspace.query({ client: trx }).where('id', workspaceId).forUpdate().firstOrFail()

        if (workspace.onboardingStatus !== 'not_started') {
          throw new WorkspaceOnboardingStartError(workspace.onboardingStatus)
        }

        workspace.onboardingStatus = 'in_progress'
        workspace.useTransaction(trx)
        await workspace.save()

        invocation.useTransaction(trx)
        await invocation.save()

        const result = await this.taskLifecycleService.createTaskForNewInvocation(
          {
            workspaceId,
            userId: user.id,
            invocationId: invocation.id,
            description: WORKSPACE_ONBOARDING_TASK_DESCRIPTION,
          },
          { client: trx }
        )

        taskId = result.task.id
        taskCreated = result.created
      })
    } catch (error) {
      if (error instanceof WorkspaceOnboardingStartError) {
        return response.conflict({
          error: 'Workspace onboarding is not available',
          onboardingStatus: error.onboardingStatus,
        })
      }

      throw error
    }

    if (!taskId) {
      throw new Error('Onboarding task creation failed')
    }

    AgentInvoked.dispatch(invocation, createEventContext({ userId: user.id, workspaceId, organizationId }))

    if (taskCreated) {
      this.taskTitleService.generateTitleInBackground(taskId, user.id, WORKSPACE_ONBOARDING_TASK_DESCRIPTION)
    }

    return {
      invocationId: invocation.id,
      taskId,
      onboardingStatus: 'in_progress' as const,
    }
  }

  async invoke({ params, request, auth, response, organizationId }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id

    if (!organizationId) {
      return response.badRequest({ error: 'Workspace context is required' })
    }

    const data = await request.validateUsing(invokeValidator)

    if (data.invocation_id && data.edited_invocation_id) {
      return response.badRequest({
        error: 'invocation_id and edited_invocation_id are mutually exclusive',
      })
    }

    // Generate invocation ID upfront
    const invocationId = randomUUID()

    let parentInvocation: Invocation | null = null
    let editedTask: Task | null = null
    let editedInvocation: Invocation | null = null
    let rootInvocationId: string = invocationId
    let rootDescription = data.query

    if (data.edited_invocation_id) {
      editedInvocation = await Invocation.query()
        .where('id', data.edited_invocation_id)
        .where('workspace_id', workspaceId)
        .where('user_id', user.id)
        .first()

      if (!editedInvocation) {
        return response.badRequest({ error: 'Invalid edited invocation id' })
      }

      editedTask = await this.taskLifecycleService.findTaskContainingInvocationInLatestChain(
        editedInvocation.id,
        workspaceId,
        user.id
      )

      if (!editedTask) {
        return response.badRequest({ error: 'Invalid edited invocation id' })
      }

      if (this.isTaskRunning(editedTask)) {
        return response.conflict({
          error: 'Cannot edit while this task is running',
          taskId: editedTask.id,
        })
      }

      if (editedInvocation.parentInvocationId) {
        parentInvocation = await Invocation.query()
          .where('id', editedInvocation.parentInvocationId)
          .where('workspace_id', workspaceId)
          .where('user_id', user.id)
          .first()

        if (!parentInvocation) {
          return response.badRequest({ error: 'Invalid edited invocation id' })
        }
      }

      rootInvocationId = editedTask.rootInvocationId
      rootDescription = editedTask.description
    } else if (data.invocation_id) {
      parentInvocation = await Invocation.query()
        .where('id', data.invocation_id)
        .where('workspace_id', workspaceId)
        .where('user_id', user.id)
        .first()

      if (!parentInvocation) {
        return response.badRequest({ error: 'Invalid parent invocation id' })
      }

      rootInvocationId = await this.taskLifecycleService.resolveRootInvocationIdForScope(
        parentInvocation.id,
        workspaceId,
        user.id
      )

      if (rootInvocationId === parentInvocation.id) {
        rootDescription = parentInvocation.query
      } else {
        const rootInvocation = await Invocation.query()
          .where('id', rootInvocationId)
          .where('workspace_id', workspaceId)
          .where('user_id', user.id)
          .select('query')
          .first()

        rootDescription = rootInvocation?.query ?? parentInvocation.query
      }
    }

    const invocationSource = data.source || editedInvocation?.source || parentInvocation?.source || null

    const organization = await Organization.findOrFail(organizationId)
    const gateResult = await this.organizationUsageService.evaluateLimitGate(organization)
    const userConfig = await this.userConfigService.getConfig(user.id)
    const serializedProvider =
      parentInvocation?.agentState?.state.provider ?? userConfig.llmProvider ?? DEFAULT_LLM_PROVIDER
    const persistEditContext = this.buildPersistEditContext(editedTask, editedInvocation)
    const agentMode = normalizeAgentMode(data.mode)

    if (gateResult.blocked) {
      const blockedInvocation = new Invocation().fill({
        id: invocationId,
        workspaceId,
        canvasId: data.canvas_id || null,
        query: data.query,
        agentState: this.buildBlockedInvocationState({
          invocationId,
          gateResult,
          query: data.query,
          parentState: parentInvocation?.agentState?.state,
          provider: serializedProvider,
        }),
        parentInvocationId: parentInvocation?.id || null,
        files: null,
        yoloMode: data.yolo_mode || false,
        mode: agentMode,
        userId: user.id,
        source: invocationSource,
      })

      const persistResult = await this.persistInvocationAndTaskOrRespond(
        response,
        {
          invocation: blockedInvocation,
          parentInvocation,
          rootInvocationId,
          rootDescription,
          workspaceId,
          userId: user.id,
          query: data.query,
          editContext: persistEditContext,
        },
        editedTask?.id
      )

      if (!persistResult.ok) {
        return persistResult.response
      }

      const taskId = persistResult.taskId

      await this.taskLifecycleService.markInvocationTerminal(blockedInvocation.id, 'error')

      InvocationCompleted.dispatch(
        {
          invocationId: blockedInvocation.id,
          workspaceId,
          organizationId,
          userId: user.id,
          blocked: true,
        },
        createEventContext({ userId: user.id, workspaceId, organizationId })
      )

      return {
        invocationId: blockedInvocation.id,
        taskId,
        state: blockedInvocation.agentState,
        blocked: {
          reason: gateResult.message,
          resetAtUtc: gateResult.resetAtUtc?.toISO() ?? null,
          blockedPeriodTypes: gateResult.blockedPeriodTypes,
        },
      }
    }

    // Handle file uploads if present
    let uploadedFiles: UploadedFile[] | null = null
    if (data.files && data.files.length > 0) {
      uploadedFiles = []

      for (const file of data.files) {
        const fileId = randomUUID()
        const filename = `${fileId}.${file.extname}`
        const filePath = `invocations/${invocationId}/${filename}`

        // Move file to storage using Drive
        await moveMultipartFileToDisk(file, filePath)

        uploadedFiles.push({
          id: fileId,
          filename: file.clientName,
          path: filePath,
          mimeType: mime.getType(file.extname!) || 'application/octet-stream',
          size: file.size,
        })
      }
    }

    const invocation = new Invocation().fill({
      id: invocationId,
      workspaceId,
      canvasId: data.canvas_id || null,
      query: data.query,
      agentState: null,
      parentInvocationId: parentInvocation?.id || null,
      files: uploadedFiles,
      yoloMode: data.yolo_mode || false,
      mode: agentMode,
      userId: user.id,
      source: invocationSource,
    })

    // Set ephemeral properties (not persisted to DB)
    invocation.selectedText = data.selected_text
      ? { nodeId: data.selected_text.node_id, nodeName: data.selected_text.node_name, text: data.selected_text.text }
      : null
    invocation.workspaceTree = data.workspace_tree || null
    invocation.canvasPath = data.canvas_path ?? null
    invocation.activeCanvasContext = data.active_canvas_context ?? null
    invocation.selectedNodePaths = data.selected_node_paths || null
    invocation.mentionedNodePaths = data.mentioned_node_paths || null

    const persistResult = await this.persistInvocationAndTaskOrRespond(
      response,
      {
        invocation,
        parentInvocation,
        rootInvocationId,
        rootDescription,
        workspaceId,
        userId: user.id,
        query: data.query,
        editContext: persistEditContext,
      },
      editedTask?.id
    )

    if (!persistResult.ok) {
      return persistResult.response
    }

    const { taskId, taskCreated } = persistResult

    AgentInvoked.dispatch(invocation, createEventContext({ userId: user.id, workspaceId, organizationId }))

    if (!parentInvocation && taskCreated) {
      this.taskTitleService.generateTitleInBackground(taskId, user.id, data.query)
    }

    return {
      invocationId: invocation.id,
      taskId,
    }
  }

  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const invocation = await Invocation.query().where('id', params.invocationId).firstOrFail()

    const access = await authorizeWorkspaceAccess(user.id, invocation.workspaceId)

    if (access === 'workspace_not_found') {
      return response.notFound({ error: 'Workspace not found' })
    }

    if (access === 'not_member' || access === 'not_admin') {
      return response.unauthorized({ error: 'Unauthorized' })
    }

    return {
      invocationId: invocation.id,
      state: invocation.agentState,
    }
  }

  async answerQuestion({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const invocation = await Invocation.query().where('id', params.invocationId).firstOrFail()

    const access = await authorizeWorkspaceAccess(user.id, invocation.workspaceId)

    if (access === 'workspace_not_found') {
      return response.notFound({ error: 'Workspace not found' })
    }

    if (access === 'not_member' || access === 'not_admin') {
      return response.unauthorized({ error: 'Unauthorized' })
    }

    if (invocation.userId !== user.id) {
      return response.unauthorized({ error: 'Unauthorized' })
    }

    const data = await request.validateUsing(answerQuestionValidator)

    const organization = await Organization.findOrFail(access.organizationId)
    const gateResult = await this.organizationUsageService.evaluateLimitGate(organization)
    const userConfig = await this.userConfigService.getConfig(invocation.userId)
    const serializedProvider = invocation.agentState?.state.provider ?? userConfig.llmProvider ?? DEFAULT_LLM_PROVIDER
    const agentMode = normalizeAgentMode(data.mode ?? invocation.mode)

    let taskId: string | null = null
    let responseState: AgentSocketMessage | null = null

    try {
      await db.transaction(async (trx) => {
        const lockedInvocation = await Invocation.query({ client: trx })
          .where('id', invocation.id)
          .where('workspace_id', invocation.workspaceId)
          .where('user_id', invocation.userId)
          .forUpdate()
          .firstOrFail()

        if (lockedInvocation.agentRecoveredAt) {
          throw new QuestionAnswerError('question_not_found')
        }

        const answerAgentState = this.applyQuestionAnswerToState({
          parentState: lockedInvocation.agentState?.state,
          itemId: params.itemId,
          answers: data.answers,
          provider: serializedProvider,
        })

        const blockedAgentState = gateResult.blocked
          ? this.buildBlockedQuestionAnswerState({
              parentState: answerAgentState.state,
              gateResult,
              provider: serializedProvider,
            })
          : null

        lockedInvocation.agentState = blockedAgentState ?? answerAgentState
        lockedInvocation.canvasId = data.canvas_id ?? lockedInvocation.canvasId
        lockedInvocation.yoloMode = data.yolo_mode ?? lockedInvocation.yoloMode ?? false
        lockedInvocation.mode = agentMode
        lockedInvocation.agentRuntimeOwnerId = null
        lockedInvocation.agentLeaseExpiresAt = null
        lockedInvocation.agentCancelRequestedAt = null
        lockedInvocation.agentCancelReason = null
        lockedInvocation.agentStartedAt = gateResult.blocked ? lockedInvocation.agentStartedAt : null
        lockedInvocation.useTransaction(trx)
        await lockedInvocation.save()

        const task = await Task.query({ client: trx })
          .where('latest_invocation_id', lockedInvocation.id)
          .whereNull('archived_at')
          .forUpdate()
          .first()

        if (!task) {
          throw new QuestionAnswerError('question_not_found')
        }

        if (task.status === 'complete' || task.status === 'error') {
          throw new QuestionAnswerError('question_already_resolved')
        }

        task.useTransaction(trx)
        task.status = gateResult.blocked ? 'error' : 'processing'
        await task.save()

        taskId = task.id
        responseState = blockedAgentState ?? answerAgentState
      })
    } catch (error) {
      if (error instanceof QuestionAnswerError) {
        if (error.reason === 'question_already_resolved') {
          return response.conflict({ error: 'Question has already been answered' })
        }

        return response.badRequest({ error: 'Pending question not found' })
      }

      throw error
    }

    if (!taskId || !responseState) {
      throw new Error('Question answer resume failed')
    }

    const task = await Task.findOrFail(taskId)
    await this.taskLifecycleService.emitTaskUpsert(task)

    if (gateResult.blocked) {
      InvocationCompleted.dispatch(
        {
          invocationId: invocation.id,
          workspaceId: invocation.workspaceId,
          organizationId: access.organizationId,
          userId: invocation.userId,
          blocked: true,
        },
        createEventContext({
          userId: invocation.userId,
          workspaceId: invocation.workspaceId,
          organizationId: access.organizationId,
        })
      )

      return {
        invocationId: invocation.id,
        taskId,
        state: responseState,
        blocked: {
          reason: gateResult.message,
          resetAtUtc: gateResult.resetAtUtc?.toISO() ?? null,
          blockedPeriodTypes: gateResult.blockedPeriodTypes,
        },
      }
    }

    const resumeInvocation = await Invocation.findOrFail(invocation.id)
    resumeInvocation.workspaceTree = data.workspace_tree || null
    resumeInvocation.canvasPath = data.canvas_path ?? null
    resumeInvocation.activeCanvasContext = data.active_canvas_context ?? null
    resumeInvocation.selectedNodePaths = data.selected_node_paths || null
    resumeInvocation.mentionedNodePaths = data.mentioned_node_paths || null

    AgentInvoked.dispatch(
      resumeInvocation,
      createEventContext({
        userId: resumeInvocation.userId,
        workspaceId: resumeInvocation.workspaceId,
        organizationId: access.organizationId,
      })
    )

    return {
      invocationId: invocation.id,
      taskId,
      state: responseState,
    }
  }

  async command({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const invocation = await Invocation.query().where('id', params.invocationId).firstOrFail()

    const access = await authorizeWorkspaceAccess(user.id, invocation.workspaceId)

    if (access === 'workspace_not_found') {
      return response.notFound({ error: 'Workspace not found' })
    }

    if (access === 'not_member') {
      return response.unauthorized({ error: 'Unauthorized' })
    }

    const data = await request.validateUsing(CommandSchema)

    if (data.type === 'cancel_operation') {
      await this.agentRuntimeService.requestCancel(invocation.id, data.reason)
    }

    const subscribers = await this.agentCommandService.publish(invocation.id, data)

    if (data.type === 'cancel_operation' && subscribers === 0) {
      const recovered = await this.agentRuntimeService.recoverIfStartedWithoutSubscribers(invocation.id)
      if (recovered) {
        return {
          success: true,
          recovered: true,
          state: recovered.message,
        }
      }
    }

    return {
      success: true,
    }
  }
}
