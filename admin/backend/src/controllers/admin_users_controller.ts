import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import User from 'backend/models/user'
import Task from 'backend/models/task'
import UserConfig from 'backend/models/user-config'
import {
  InvalidUserLlmConfigError,
  normalizeUserLlmConfigUpdates,
  type UserLlmConfigUpdates,
} from 'backend/agent/providers/user-config'
import { ContextualLogger } from 'backend/services/contextual-logger'

const logger = ContextualLogger.createFallback({ component: 'AdminUsersController' })

export default class AdminUsersController {
  async index({ request }: HttpContext) {
    const search = request.input('search', '').trim()

    const query = User.query().preload('organizationMemberships').orderBy('createdAt', 'desc')

    if (search) {
      query.where((q) => {
        q.whereILike('email', `%${search}%`).orWhereILike('name', `%${search}%`)
      })
    }

    const users = await query.limit(200)

    const orgIds = [...new Set(users.flatMap((u) => u.organizationMemberships.map((m) => m.organizationId)))]
    const orgs =
      orgIds.length > 0
        ? await import('backend/models/organization').then((m) => m.default.query().whereIn('id', orgIds))
        : []
    const orgMap = new Map(orgs.map((o) => [o.id, o]))

    const userIds = users.map((u) => u.id)
    const configs =
      userIds.length > 0 ? await UserConfig.query().whereIn('userId', userIds).whereNull('workspaceId') : []
    const configMap = new Map(configs.map((c) => [c.userId, c.config]))

    return users.map((user) => {
      const membership = user.organizationMemberships[0]
      const org = membership ? orgMap.get(membership.organizationId) : null
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt?.toISO(),
        orgRole: membership?.role ?? null,
        organization: org ? { id: org.id, name: org.name } : null,
        config: configMap.get(user.id) ?? {},
      }
    })
  }

  async show({ params }: HttpContext) {
    const user = await User.query().where('id', params.id).preload('organizationMemberships').firstOrFail()

    const membership = user.organizationMemberships[0]
    let org = null
    let usage = null

    if (membership) {
      const { default: Organization } = await import('backend/models/organization')
      org = await Organization.find(membership.organizationId)

      if (org) {
        try {
          const { default: PostHogUsageQueryService } = await import('backend/services/posthog-usage')
          const { default: OrganizationUsageService } = await import('backend/services/organization-usage')
          const usageService = new OrganizationUsageService(new PostHogUsageQueryService())
          usage = await usageService.getCurrentUsageSnapshot(org)
        } catch {
          // Usage may not be available (PostHog not configured, etc.)
        }
      }
    }

    const tasks = await Task.query().where('userId', user.id).orderBy('createdAt', 'desc').limit(20)

    const config = await UserConfig.query().where('userId', user.id).whereNull('workspaceId').first()

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt?.toISO(),
      orgRole: membership?.role ?? null,
      organization: org
        ? {
            id: org.id,
            name: org.name,
            weeklyLimitCents: org.weeklyLimitCents,
            monthlyLimitCents: org.monthlyLimitCents,
          }
        : null,
      usage,
      config: config?.config ?? {},
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        description: t.description,
        createdAt: t.createdAt?.toISO(),
        updatedAt: t.updatedAt?.toISO(),
      })),
    }
  }

  async updateConfig({ params, request, response }: HttpContext) {
    try {
      const user = await User.findOrFail(params.id)
      let config = await UserConfig.query().where('userId', user.id).whereNull('workspaceId').first()
      const existingConfig = config?.config ?? {}
      const updates = normalizeUserLlmConfigUpdates(request.body(), existingConfig)

      if (!config && !hasStoredConfigValues(updates)) {
        return { config: {} }
      }

      if (!config) {
        const nextConfig = mergeStoredConfig({}, updates)
        config = await UserConfig.create({
          userId: user.id,
          workspaceId: null,
          config: nextConfig,
        })
      } else {
        config.config = mergeStoredConfig(config.config, updates)
        await config.save()
      }

      return { config: config.config }
    } catch (error) {
      if (error instanceof InvalidUserLlmConfigError) {
        return response.badRequest({ error: error.message })
      }

      throw error
    }
  }

  async impersonate({ params }: HttpContext) {
    const user = await User.findOrFail(params.id)
    const token = await User.accessTokens.create(user)

    return {
      token: token.value!.release(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    }
  }

  async createDevUser({ request, response }: HttpContext) {
    const app = await import('@adonisjs/core/services/app')
    if (app.default.inProduction) {
      return response.notFound({ error: 'Not available' })
    }

    const name = request.input('name', '').trim()
    const email = request.input('email', '').trim()
    let config: UserLlmConfigUpdates = {}

    if (!email) {
      return { error: 'Email is required' }
    }

    const existing = await User.findBy('email', email)
    if (existing) {
      return { error: 'User already exists' }
    }

    try {
      config = normalizeUserLlmConfigUpdates(request.input('config', {}))

      const app = await import('@adonisjs/core/services/app')
      const { WorkspaceService } = await import('backend/services/workspace')
      const workspaceService = await app.default.container.make(WorkspaceService)

      const result = await db.transaction(async (trx) => {
        const user = await User.create({ email, name: name || undefined, password: null }, { client: trx })
        const workspace = await workspaceService.createWorkspaceForUser(user.id, 'Personal', trx)

        if (hasStoredConfigValues(config)) {
          await UserConfig.create(
            { userId: user.id, workspaceId: null, config: mergeStoredConfig({}, config) },
            { client: trx }
          )
        }

        return { user, workspaceId: workspace.id }
      })

      const token = await User.accessTokens.create(result.user)

      return {
        token: token.value!.release(),
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        },
        workspaceId: result.workspaceId,
      }
    } catch (err) {
      if (err instanceof InvalidUserLlmConfigError) {
        return response.badRequest({ error: err.message })
      }

      logger.error({ err }, 'Failed to create dev user')
      return response.internalServerError({ error: 'Failed to create user' })
    }
  }
}

function hasStoredConfigValues(config: object): boolean {
  return Object.values(config).some((value) => value !== null && value !== undefined)
}

function mergeStoredConfig(existing: Record<string, unknown>, updates: object): Record<string, unknown> {
  const nextConfig = { ...existing }

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined) {
      delete nextConfig[key]
      continue
    }

    nextConfig[key] = value
  }

  return nextConfig
}
