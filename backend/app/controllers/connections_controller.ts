import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import ComposioService, {
  ConnectionNotInWorkspaceError,
  InvalidConnectionCallbackUrlError,
  InvalidCustomAuthConfigError,
  ToolkitRequiredError,
  ToolkitRequiresCustomAuthConfigError,
} from '#services/composio_service'
import ConnectionsCatalogCacheService from '#services/connections_catalog_cache_service'
import {
  customAuthRequirementsQueryValidator,
  initiateConnectionValidator,
  toolkitsQueryValidator,
} from '#validators/connection'
import { toError } from '#services/error_utils'

@inject()
export default class ConnectionsController {
  constructor(
    private composioService: ComposioService,
    private connectionsCatalogCacheService: ConnectionsCatalogCacheService
  ) {}

  private badRequest(response: HttpContext['response'], code: string, error: string) {
    return response.badRequest({
      code,
      error,
    })
  }

  private internalServerError(response: HttpContext['response'], code: string, error: string) {
    return response.internalServerError({
      code,
      error,
    })
  }
  /**
   * GET /workspaces/:id/connections
   * List all connection statuses for the workspace
   */
  async index({ params, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id

    const [catalogEntries, workspaceConnections] = await Promise.all([
      this.connectionsCatalogCacheService.getCatalog(() => this.composioService.listGlobalToolkitCatalog()),
      this.composioService.listWorkspaceConnectedToolkits(user.id, workspaceId),
    ])

    const connections = this.composioService.mergeCatalogWithWorkspaceConnections(catalogEntries, workspaceConnections)

    return { connections }
  }

  /**
   * GET /workspaces/:id/connections/toolkits
   * Get list of available toolkits (integrations)
   */
  async toolkits({ params, auth, request }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id
    const query = await toolkitsQueryValidator.validate(request.qs())

    const search = query.search
    const isConnected =
      query.isConnected === undefined ? undefined : query.isConnected.toLowerCase() === 'true' ? true : false

    const toolkits = await this.composioService.listToolkits(user.id, workspaceId, {
      search,
      isConnected,
    })

    return { toolkits }
  }

  /**
   * GET /workspaces/:id/connections/custom-auth-requirements
   * Return custom auth field metadata for a toolkit
   */
  async customAuthRequirements({ request, response, logger }: HttpContext) {
    const query = await customAuthRequirementsQueryValidator.validate(request.qs())
    const toolkit = query.toolkit ?? ''

    if (!toolkit) {
      return this.badRequest(response, 'TOOLKIT_REQUIRED', 'Toolkit is required')
    }

    try {
      const requirements = await this.composioService.getCustomAuthRequirements(toolkit)
      return requirements
    } catch (error) {
      if (error instanceof ToolkitRequiredError) {
        return this.badRequest(response, 'TOOLKIT_REQUIRED', error.message)
      }

      logger.error(
        {
          operation: 'connections.custom_auth_requirements_failed',
          toolkit,
          err: toError(error),
        },
        'Failed to load custom auth requirements'
      )

      return this.internalServerError(
        response,
        'CUSTOM_AUTH_REQUIREMENTS_FAILED',
        'Failed to load custom auth requirements'
      )
    }
  }

  /**
   * POST /workspaces/:id/connections/initiate
   * Start authentication flow for a toolkit
   */
  async initiate({ params, auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id
    const data = await request.validateUsing(initiateConnectionValidator)

    try {
      const result = await this.composioService.initiateConnection(user.id, workspaceId, {
        toolkit: data.toolkit,
        customAuth: data.customAuth,
        callbackUrl: data.callbackUrl,
      })

      return {
        status: 'OK' as const,
        redirectUrl: result.redirectUrl,
        connectedAccountId: result.connectedAccountId,
      }
    } catch (error) {
      if (error instanceof ToolkitRequiredError) {
        return this.badRequest(response, 'TOOLKIT_REQUIRED', error.message)
      }

      if (error instanceof ToolkitRequiresCustomAuthConfigError) {
        const toolkit = data.toolkit?.trim()
        if (!toolkit) {
          return this.badRequest(response, 'TOOLKIT_REQUIRED', 'Toolkit is required')
        }

        try {
          const requirements = await this.composioService.getCustomAuthRequirements(toolkit)

          return response.ok({
            status: 'CUSTOM_AUTH_REQUIRED' as const,
            requirements,
          })
        } catch (requirementsError) {
          logger.error(
            {
              operation: 'connections.initiate_custom_auth_requirements_failed',
              workspaceId,
              userId: user.id,
              toolkit,
              err: toError(requirementsError),
            },
            'Failed to load custom auth requirements while initiating connection'
          )

          return this.internalServerError(response, 'INITIATE_FAILED', 'Failed to initiate connection')
        }
      }

      if (error instanceof InvalidCustomAuthConfigError) {
        return this.badRequest(response, 'CUSTOM_AUTH_INVALID', error.message)
      }

      if (error instanceof InvalidConnectionCallbackUrlError) {
        return this.badRequest(response, 'INVALID_CALLBACK_URL', error.message)
      }

      logger.error(
        {
          operation: 'connections.initiate_failed',
          workspaceId,
          userId: user.id,
          toolkit: data.toolkit,
          err: toError(error),
        },
        'Failed to initiate Composio connection'
      )

      return this.internalServerError(response, 'INITIATE_FAILED', 'Failed to initiate connection')
    }
  }

  /**
   * DELETE /workspaces/:id/connections/:connectionId
   * Disconnect a connected account
   */
  async destroy({ params, response, auth, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id
    const connectedAccountId = params.connectionId

    try {
      await this.composioService.disconnectForWorkspace(user.id, workspaceId, connectedAccountId)

      return { success: true }
    } catch (error) {
      if (error instanceof ConnectionNotInWorkspaceError) {
        return response.notFound({
          error: 'Connection not found',
        })
      }

      logger.error(
        {
          operation: 'connections.disconnect_failed',
          workspaceId,
          userId: user.id,
          connectedAccountId,
          err: toError(error),
        },
        'Failed to disconnect Composio connection'
      )

      return response.internalServerError({
        error: 'Failed to disconnect',
      })
    }
  }
}
