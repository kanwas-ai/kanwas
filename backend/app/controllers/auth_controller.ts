import User from '#models/user'
import OAuthAccount from '#models/o_auth_account'
import {
  googleAuthUrlValidator,
  googleCallbackValidator,
  loginValidator,
  registerValidator,
  updateProfileValidator,
  UserSchema,
} from '#validators/auth'
import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { GoogleOAuthService } from '#services/google_oauth_service'
import { OrganizationWorkspaceNotFoundError, WorkspaceService } from '#services/workspace_service'
import { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import OrganizationInviteService, {
  InvalidInviteTokenError,
  InvalidOAuthStateError,
} from '#services/organization_invite_service'
import { generateSeededPersonName, isValidPersonName, normalizePersonName } from '#services/person_name'
import { handleWorkspaceSeedFailure } from '#controllers/helpers/workspace_seed_failure'
import WorkspaceCreated, { type WorkspaceCreatedSource } from '#events/workspace_created'
import UserRegistered, { type UserRegisteredSource } from '#events/user_registered'
import { createEventContext } from '#contracts/event_context'
import { toError } from '#services/error_utils'

type PendingWorkspaceCreatedEvent = {
  workspaceId: string
  organizationId: string
  source: WorkspaceCreatedSource
}

type PendingUserRegisteredEvent = {
  userId: string
  email: string
  name: string
  source: UserRegisteredSource
  viaInvite: boolean
  workspaceId?: string
  organizationId?: string
}

@inject()
export default class AuthController {
  constructor(
    private workspaceService: WorkspaceService,
    private organizationInviteService: OrganizationInviteService
  ) {}

  private dispatchWorkspaceCreated(userId: string, event: PendingWorkspaceCreatedEvent | null): void {
    if (!event) {
      return
    }

    WorkspaceCreated.dispatch(
      event.workspaceId,
      event.organizationId,
      userId,
      event.source,
      createEventContext({
        userId,
        workspaceId: event.workspaceId,
        organizationId: event.organizationId,
      })
    )
  }

  private dispatchUserRegistered(event: PendingUserRegisteredEvent | null): void {
    if (!event) {
      return
    }

    UserRegistered.dispatch(
      event.userId,
      event.email,
      event.name,
      event.source,
      event.viaInvite,
      createEventContext({
        userId: event.userId,
        workspaceId: event.workspaceId,
        organizationId: event.organizationId,
      })
    )
  }

  async register({ request, response, correlationId }: HttpContext) {
    const data = await request.validateUsing(registerValidator)

    if (!data.inviteToken && !data.name) {
      return response.unprocessableEntity({
        error: 'Name is required when registering without an invite',
      })
    }

    let user: User
    let workspaceId: string | undefined
    let pendingWorkspaceCreatedEvent: PendingWorkspaceCreatedEvent | null = null
    let pendingUserRegisteredEvent: PendingUserRegisteredEvent | null = null

    try {
      const result = await db.transaction(async (trx) => {
        const fallbackName = data.name ? normalizePersonName(data.name) : generateSeededPersonName(data.email)

        const newUser = await User.create(
          {
            email: data.email,
            name: fallbackName,
            password: data.password,
          },
          { client: trx }
        )

        if (data.inviteToken) {
          const inviteResult = await this.organizationInviteService.acceptInviteTokenForUser(
            data.inviteToken,
            newUser.id,
            trx
          )

          newUser.name = inviteResult.inviteeName
          await newUser.save()

          return {
            user: newUser,
            workspaceId: inviteResult.workspaceId,
            pendingWorkspaceCreatedEvent: null,
            pendingUserRegisteredEvent: {
              userId: newUser.id,
              email: newUser.email,
              name: newUser.name,
              source: 'password' as const,
              viaInvite: true,
              workspaceId: inviteResult.workspaceId,
              organizationId: inviteResult.organizationId,
            },
          }
        }

        const workspace = await this.workspaceService.createWorkspaceForUser(newUser.id, 'Personal', trx, correlationId)
        return {
          user: newUser,
          workspaceId: workspace.id,
          pendingWorkspaceCreatedEvent: {
            workspaceId: workspace.id,
            organizationId: workspace.organizationId,
            source: 'onboarding' as const,
          },
          pendingUserRegisteredEvent: {
            userId: newUser.id,
            email: newUser.email,
            name: newUser.name,
            source: 'password' as const,
            viaInvite: false,
            workspaceId: workspace.id,
            organizationId: workspace.organizationId,
          },
        }
      })

      user = result.user
      workspaceId = result.workspaceId
      pendingWorkspaceCreatedEvent = result.pendingWorkspaceCreatedEvent
      pendingUserRegisteredEvent = result.pendingUserRegisteredEvent
    } catch (error) {
      if (error instanceof InvalidInviteTokenError) {
        return response.badRequest({ error: error.message })
      }

      if (error instanceof OrganizationWorkspaceNotFoundError) {
        return response.conflict({ error: error.message })
      }

      if (handleWorkspaceSeedFailure(error, response)) {
        return
      }

      throw error
    }

    this.dispatchWorkspaceCreated(user.id, pendingWorkspaceCreatedEvent)
    this.dispatchUserRegistered(pendingUserRegisteredEvent)

    const token = await User.accessTokens.create(user)

    return {
      type: 'bearer',
      value: token.value!.release(),
      workspaceId,
    }
  }

  async login({ request, response }: HttpContext) {
    const data = await request.validateUsing(loginValidator)

    const user = await User.verifyCredentials(data.email, data.password)
    let workspaceId: string | undefined
    let pendingWorkspaceCreatedEvent: PendingWorkspaceCreatedEvent | null = null

    if (data.inviteToken) {
      try {
        const inviteResult = await this.organizationInviteService.acceptInviteTokenForUser(data.inviteToken, user.id)
        workspaceId = inviteResult.workspaceId
      } catch (error) {
        if (error instanceof InvalidInviteTokenError) {
          return response.badRequest({ error: error.message })
        }

        if (error instanceof OrganizationWorkspaceNotFoundError) {
          return response.conflict({ error: error.message })
        }

        throw error
      }
    }

    this.dispatchWorkspaceCreated(user.id, pendingWorkspaceCreatedEvent)

    const token = await User.accessTokens.create(user)

    return {
      type: 'bearer',
      value: token.value!.release(),
      workspaceId,
    }
  }

  async logout({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const token = auth.user?.currentAccessToken

    if (token) {
      await User.accessTokens.delete(user, token.identifier)
    }

    return { message: 'Logged out successfully' }
  }

  async me({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    return UserSchema.validate(user)
  }

  async updateMe({ request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const data = await request.validateUsing(updateProfileValidator)

    user.name = data.name
    await user.save()

    return UserSchema.validate(user)
  }

  async googleAuthUrl({ request, response, logger }: HttpContext) {
    const data = await googleAuthUrlValidator.validate(request.qs())

    try {
      const googleOAuth = new GoogleOAuthService()
      const state = await this.organizationInviteService.createOAuthState(data.inviteToken)
      const authUrl = googleOAuth.getAuthUrl({ state })
      return response.json({ url: authUrl })
    } catch (error) {
      if (error instanceof InvalidInviteTokenError) {
        return response.badRequest({ error: error.message })
      }

      if (error instanceof Error && error.message === 'Google OAuth credentials are not configured') {
        return response.serviceUnavailable({
          message: 'Google OAuth is not configured',
        })
      }

      logger.error({ err: toError(error) }, 'Failed to generate Google OAuth URL')

      return response.internalServerError({
        message: 'Failed to initiate Google OAuth',
      })
    }
  }

  async googleCallback({ request, response, logger, correlationId }: HttpContext) {
    const data = await request.validateUsing(googleCallbackValidator)

    try {
      const googleOAuth = new GoogleOAuthService()
      // Exchange code for tokens
      const tokens = await googleOAuth.getTokens(data.code)

      // Get user info from Google
      const googleUser = await googleOAuth.getUserInfo(tokens.access_token!)

      if (!googleUser.email) {
        return response.badRequest({ message: 'Email not provided by Google' })
      }

      const oauthState = await this.organizationInviteService.consumeOAuthState(data.state)

      // Find or create user and oauth account in transaction
      const {
        user,
        workspaceId,
        pendingWorkspaceCreatedEvent: workspaceCreatedEvent,
        pendingUserRegisteredEvent,
      } = await db.transaction(async (trx) => {
        // Try to find existing oauth account
        let oauthAccount = await OAuthAccount.query({ client: trx })
          .where('provider', 'google')
          .where('provider_user_id', googleUser.id!)
          .preload('user')
          .first()

        let authenticatedUser: User
        let onboardingWorkspaceId: string | undefined
        let pendingWorkspaceCreatedEvent: PendingWorkspaceCreatedEvent | null = null
        let registrationEvent: PendingUserRegisteredEvent | null = null
        let registrationOrganizationId: string | undefined

        if (oauthAccount) {
          // Existing OAuth account - update tokens
          authenticatedUser = oauthAccount.user
          oauthAccount.accessToken = tokens.access_token || null
          oauthAccount.refreshToken = tokens.refresh_token || null
          oauthAccount.tokenExpiresAt = tokens.expiry_date ? DateTime.fromMillis(tokens.expiry_date) : null
          oauthAccount.providerData = googleUser as any
          await oauthAccount.save()

          if (oauthState.inviteId) {
            const inviteResult = await this.organizationInviteService.acceptInviteByIdForUser(
              oauthState.inviteId,
              authenticatedUser.id,
              trx
            )
            onboardingWorkspaceId = inviteResult.workspaceId
          }
        } else {
          // Try to find user by email
          let existingUser = await User.findBy('email', googleUser.email, { client: trx })
          let createdNewUser = false

          if (!existingUser) {
            const providerName = typeof googleUser.name === 'string' ? normalizePersonName(googleUser.name) : null
            const resolvedName =
              providerName && isValidPersonName(providerName)
                ? providerName
                : generateSeededPersonName(googleUser.email!)

            // Create new user
            existingUser = await User.create(
              {
                email: googleUser.email!,
                name: resolvedName,
              },
              { client: trx }
            )
            createdNewUser = true
          }

          authenticatedUser = existingUser

          if (oauthState.inviteId) {
            const inviteResult = await this.organizationInviteService.acceptInviteByIdForUser(
              oauthState.inviteId,
              authenticatedUser.id,
              trx
            )

            if (createdNewUser) {
              authenticatedUser.name = inviteResult.inviteeName
              await authenticatedUser.save()
              registrationOrganizationId = inviteResult.organizationId
            }

            onboardingWorkspaceId = inviteResult.workspaceId
          } else if (createdNewUser) {
            const workspace = await this.workspaceService.createWorkspaceForUser(
              authenticatedUser.id,
              'Personal',
              trx,
              correlationId
            )
            onboardingWorkspaceId = workspace.id
            pendingWorkspaceCreatedEvent = {
              workspaceId: workspace.id,
              organizationId: workspace.organizationId,
              source: 'onboarding',
            }
            registrationOrganizationId = workspace.organizationId
          }

          // Create OAuth account
          await OAuthAccount.create(
            {
              userId: authenticatedUser.id,
              provider: 'google',
              providerUserId: googleUser.id!,
              email: googleUser.email!,
              accessToken: tokens.access_token || null,
              refreshToken: tokens.refresh_token || null,
              tokenExpiresAt: tokens.expiry_date ? DateTime.fromMillis(tokens.expiry_date) : null,
              providerData: googleUser as any,
            },
            { client: trx }
          )

          if (createdNewUser) {
            registrationEvent = {
              userId: authenticatedUser.id,
              email: authenticatedUser.email,
              name: authenticatedUser.name,
              source: 'google',
              viaInvite: Boolean(oauthState.inviteId),
              workspaceId: onboardingWorkspaceId,
              organizationId: registrationOrganizationId,
            }
          }
        }

        return {
          user: authenticatedUser,
          workspaceId: onboardingWorkspaceId,
          pendingWorkspaceCreatedEvent,
          pendingUserRegisteredEvent: registrationEvent,
        }
      })

      this.dispatchWorkspaceCreated(user.id, workspaceCreatedEvent)
      this.dispatchUserRegistered(pendingUserRegisteredEvent)

      // Create access token after transaction is committed
      const token = await User.accessTokens.create(user)

      return {
        type: 'bearer',
        value: token.value!.release(),
        workspaceId,
      }
    } catch (error) {
      if (error instanceof InvalidInviteTokenError || error instanceof InvalidOAuthStateError) {
        return response.badRequest({ error: error.message })
      }

      if (error instanceof OrganizationWorkspaceNotFoundError) {
        return response.conflict({ error: error.message })
      }

      if (handleWorkspaceSeedFailure(error, response)) {
        return
      }

      logger.error({ err: toError(error) }, 'Google OAuth error')
      return response.internalServerError({
        message: 'Failed to authenticate with Google',
        error: toError(error).message,
      })
    }
  }
}
