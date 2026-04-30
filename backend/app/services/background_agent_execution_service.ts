import { inject } from '@adonisjs/core'
import type { Context } from '#agent/types'
import { DEFAULT_AGENT_MODE } from '#agent/modes'
import User from '#models/user'
import Workspace from '#models/workspace'
import PostHogService from '#services/posthog_service'
import { SandboxRegistry } from '#services/sandbox_registry'

type ContextOverrides = Partial<
  Omit<
    Context,
    | 'workspaceId'
    | 'organizationId'
    | 'userId'
    | 'authToken'
    | 'authTokenId'
    | 'correlationId'
    | 'invocationId'
    | 'aiSessionId'
  >
>

export interface PreparedBackgroundAgentExecution {
  context: Context
  cleanup: () => Promise<void>
}

export interface PrepareBackgroundAgentExecutionOptions {
  user: User
  workspace: Workspace
  invocationId: string
  aiSessionId: string
  correlationId: string
  tokenExpiresIn: string
  contextOverrides?: ContextOverrides
}

@inject()
export default class BackgroundAgentExecutionService {
  constructor(
    private sandboxRegistry: SandboxRegistry,
    private posthogService: PostHogService
  ) {}

  async prepareExecution(options: PrepareBackgroundAgentExecutionOptions): Promise<PreparedBackgroundAgentExecution> {
    const accessToken = await User.accessTokens.create(options.user, [`workspace:${options.workspace.id}:sandbox`], {
      expiresIn: options.tokenExpiresIn,
    })
    const authToken = accessToken.value!.release()
    const authTokenId = accessToken.identifier

    this.posthogService.identifyUser({
      id: options.user.id,
      email: options.user.email,
      name: options.user.name,
      createdAt: options.user.createdAt,
      updatedAt: options.user.updatedAt,
    })

    return {
      context: {
        canvasId: null,
        workspaceId: options.workspace.id,
        organizationId: options.workspace.organizationId,
        userId: options.user.id,
        userName: options.user.name?.trim() || null,
        uploadedFiles: null,
        agentMode: DEFAULT_AGENT_MODE,
        yoloMode: false,
        selectedText: null,
        authToken,
        authTokenId,
        correlationId: options.correlationId,
        invocationId: options.invocationId,
        aiSessionId: options.aiSessionId,
        invocationSource: null,
        workspaceTree: null,
        canvasPath: null,
        activeCanvasContext: null,
        selectedNodePaths: null,
        mentionedNodePaths: null,
        connectedExternalTools: null,
        connectedExternalToolsLookupCompleted: false,
        ...options.contextOverrides,
      },
      cleanup: async () => {
        let shutdownError: Error | null = null

        try {
          await this.sandboxRegistry.shutdownInvocationSandbox(options.invocationId, { deleteAuthToken: false })
        } catch (error) {
          shutdownError = error instanceof Error ? error : new Error(String(error))
        }

        try {
          await User.accessTokens.delete(options.user, authTokenId)
        } catch {
          // Ignore missing tokens after partial startup failures
        }

        if (shutdownError) {
          throw shutdownError
        }
      },
    }
  }
}
