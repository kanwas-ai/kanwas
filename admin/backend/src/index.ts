import type { HttpContext, Router } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import app from '@adonisjs/core/services/app'
import mime from 'mime'
import AdminAuthMiddleware, { getAdminPath, isAdminConfigured } from './middleware/admin_auth_middleware.js'

export { getAdminPath, isAdminConfigured, AdminAuthMiddleware }

export interface AdminModuleContext {
  router: Router
}

export function registerAdminModule(ctx: AdminModuleContext): void {
  const { router } = ctx

  if (!isAdminConfigured()) {
    return
  }

  const adminPath = getAdminPath()
  const adminAuth = new AdminAuthMiddleware()
  const adminAuthMiddleware = (httpCtx: HttpContext, next: NextFn) => adminAuth.handle(httpCtx, next)

  const AdminAuthController = () => import('./controllers/admin_auth_controller.js')
  const AdminDashboardController = () => import('./controllers/admin_dashboard_controller.js')
  const AdminUsersController = () => import('./controllers/admin_users_controller.js')
  const AdminWorkspacesController = () => import('./controllers/admin_workspaces_controller.js')
  const AdminWorkspaceTemplatesController = () => import('./controllers/admin_workspace_templates_controller.js')
  const AdminEmbedTemplatesController = () => import('./controllers/admin_embed_templates_controller.js')
  const AdminSkillsController = () => import('./controllers/admin_skills_controller.js')
  const LlmDefaultsController = () => import('./controllers/llm_defaults_controller.js')

  router.get(`/${adminPath}/login`, [AdminAuthController, 'showLogin']).as('admin.login')
  router.post(`/${adminPath}/login`, [AdminAuthController, 'login']).as('admin.loginPost')

  router
    .get(`/${adminPath}/logo.png`, async ({ response }) => {
      const logoPath = app.makePath('resources/admin/logo.png')
      if (existsSync(logoPath)) {
        response.type(extname(logoPath) || '.png')
        return response.stream(createReadStream(logoPath))
      }
      return response.notFound('')
    })
    .as('admin.logo')

  router
    .group(() => {
      router.post('/logout', [AdminAuthController, 'logout']).as('admin.logout')

      router.get('/api/users', [AdminUsersController, 'index']).as('admin.users.index')
      router.get('/api/users/:id', [AdminUsersController, 'show']).as('admin.users.show')
      router.patch('/api/users/:id/config', [AdminUsersController, 'updateConfig']).as('admin.users.updateConfig')
      router.post('/api/impersonate/:id', [AdminUsersController, 'impersonate']).as('admin.impersonate')
      router.post('/api/dev/create-user', [AdminUsersController, 'createDevUser']).as('admin.dev.createUser')

      router.get('/api/workspaces', [AdminWorkspacesController, 'index']).as('admin.workspaces.index')
      router
        .get('/api/workspaces/:id/template-export', [AdminWorkspacesController, 'exportTemplate'])
        .as('admin.workspaces.exportTemplate')

      router
        .get('/api/workspace-templates/default', [AdminWorkspaceTemplatesController, 'show'])
        .as('admin.workspaceTemplates.show')
      router
        .post('/api/workspace-templates/default', [AdminWorkspaceTemplatesController, 'store'])
        .as('admin.workspaceTemplates.store')
      router
        .delete('/api/workspace-templates/default', [AdminWorkspaceTemplatesController, 'destroy'])
        .as('admin.workspaceTemplates.destroy')

      router.get('/api/dashboard/overview', [AdminDashboardController, 'overview']).as('admin.dashboard.overview')
      router.get('/api/dashboard/usage', [AdminDashboardController, 'usage']).as('admin.dashboard.usage')
      router.get('/api/dashboard/cost', [AdminDashboardController, 'cost']).as('admin.dashboard.cost')

      router.get('/api/llm-defaults', [LlmDefaultsController, 'show']).as('admin.llmDefaults.show')
      router.patch('/api/llm-defaults', [LlmDefaultsController, 'update']).as('admin.llmDefaults.update')

      router.get('/api/skills', [AdminSkillsController, 'index']).as('admin.skills.index')
      router.post('/api/skills', [AdminSkillsController, 'store']).as('admin.skills.store')
      router.patch('/api/skills/:id', [AdminSkillsController, 'update']).as('admin.skills.update')
      router.delete('/api/skills/:id', [AdminSkillsController, 'destroy']).as('admin.skills.destroy')

      router.get('/api/embed-templates', [AdminEmbedTemplatesController, 'index']).as('admin.embedTemplates.index')
      router.post('/api/embed-templates', [AdminEmbedTemplatesController, 'store']).as('admin.embedTemplates.store')
      router
        .delete('/api/embed-templates/:id', [AdminEmbedTemplatesController, 'destroy'])
        .as('admin.embedTemplates.destroy')

      const serveAdmin = async ({ request, response }: HttpContext) => {
        const adminDir = app.makePath('resources/admin')
        const segments = request.param('*')
        const requestPath = segments ? segments.join('/') : ''
        const normalizedPath = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '')
        const adminRoot = resolve(adminDir)
        const filePath = resolve(adminDir, normalizedPath)

        if (requestPath && !filePath.startsWith(`${adminRoot}${sep}`)) {
          return response.badRequest('Invalid admin asset path')
        }

        if (requestPath && normalizedPath && existsSync(filePath) && statSync(filePath).isFile()) {
          response.type(mime.getType(filePath) || 'application/octet-stream')
          return response.stream(createReadStream(filePath))
        }

        const indexPath = join(adminDir, 'index.html')
        if (existsSync(indexPath)) {
          const html = readFileSync(indexPath, 'utf8').replace(/__ADMIN_BASE__/g, adminPath)
          response.type('html')
          return response.send(html)
        }

        return response.notFound('Admin UI not built. Run: cd admin/frontend && pnpm build')
      }
      router.get('/', serveAdmin)
      router.get('/*', serveAdmin)
    })
    .prefix(`/${adminPath}`)
    .use(adminAuthMiddleware)
}
