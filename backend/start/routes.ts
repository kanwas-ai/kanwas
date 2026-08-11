import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'

const AuthController = () => import('#controllers/auth_controller')
const CliAuthController = () => import('#controllers/cli_auth_controller')
const EmbedsController = () => import('#controllers/embeds_controller')
const WorkspacesController = () => import('#controllers/workspaces_controller')
const WorkspaceDocumentsController = () => import('#controllers/workspace_documents_controller')
const FilesController = () => import('#controllers/files_controller')
const LinkMetadataController = () => import('#controllers/link_metadata_controller')
const WaitlistController = () => import('#controllers/waitlist_controller')
const DocumentSharesController = () => import('#controllers/document_shares_controller')
const YjsSocketTokensController = () => import('#controllers/yjs_socket_tokens_controller')
const OrganizationsController = () => import('#controllers/organizations_controller')
const OrganizationInvitesController = () => import('#controllers/organization_invites_controller')
const OrganizationMembersController = () => import('#controllers/organization_members_controller')
const UserConfigController = () => import('#controllers/user_config_controller')

// CLI auth (code + poll are public, authorize requires auth)
router
  .group(() => {
    router.post('/code', [CliAuthController, 'createCode']).as('cli.code')
    router.get('/poll', [CliAuthController, 'poll']).as('cli.poll')
    router.post('/authorize', [CliAuthController, 'authorize']).use([middleware.auth()]).as('cli.authorize')
  })
  .prefix('/auth/cli')

router
  .group(() => {
    router.post('/register', [AuthController, 'register']).as('register')
    router.post('/login', [AuthController, 'login']).as('login')
    router.post('/logout', [AuthController, 'logout']).use([middleware.auth(), middleware.logContext()]).as('logout')
    router
      .get('/me', [AuthController, 'me'])
      .use([middleware.auth({ allowSandboxToken: true }), middleware.logContext()])
      .as('me')
    router.patch('/me', [AuthController, 'updateMe']).use([middleware.auth(), middleware.logContext()]).as('me.update')
    router.get('/google/url', [AuthController, 'googleAuthUrl']).as('google.url')
    router.post('/google/callback', [AuthController, 'googleCallback']).as('google.callback')
  })
  .prefix('/auth')

router.post('/embed/bootstrap', [EmbedsController, 'bootstrap']).as('embed.bootstrap')
router.get('/invites/:token/preview', [OrganizationInvitesController, 'preview']).as('organizationInvites.preview')
router.get('/shares/:longHashId', [DocumentSharesController, 'resolvePublic']).as('documentShares.resolvePublic')

router
  .group(() => {
    router.get('/workspaces', [WorkspacesController, 'index']).as('workspaces.index')
    router.post('/workspaces', [WorkspacesController, 'store']).as('workspaces.store')
    router.get('/me/organizations', [OrganizationsController, 'index']).as('organizations.index')
    router.post('/invites/accept', [OrganizationInvitesController, 'accept']).as('organizationInvites.accept')

    router
      .group(() => {
        router.get('/workspaces/:id', [WorkspacesController, 'show']).as('workspaces.show')
        router.delete('/workspaces/:id', [WorkspacesController, 'destroy']).as('workspaces.destroy')
        router.patch('/workspaces/:id', [WorkspacesController, 'update']).as('workspaces.update')
        router.post('/workspaces/:id/duplicate', [WorkspacesController, 'duplicate']).as('workspaces.duplicate')
        router.get('/workspaces/:id/organization', [OrganizationsController, 'showCurrent']).as('organizations.show')

        // Link metadata endpoint - fetches OG data for URLs
        router.post('/link-metadata', [LinkMetadataController, 'fetch']).as('link.metadata')

        router.get('/workspaces/:id/document-shares', [DocumentSharesController, 'index']).as('documentShares.index')
        router.get('/workspaces/:id/notes/:noteId/share', [DocumentSharesController, 'show']).as('documentShares.show')
        router
          .post('/workspaces/:id/notes/:noteId/share', [DocumentSharesController, 'store'])
          .as('documentShares.store')
        router
          .patch('/workspaces/:id/notes/:noteId/share', [DocumentSharesController, 'update'])
          .as('documentShares.update')
        router
          .delete('/workspaces/:id/notes/:noteId/share', [DocumentSharesController, 'destroy'])
          .as('documentShares.destroy')
      })
      .use([middleware.organizationAccess()])

    router
      .group(() => {
        router.patch('/workspaces/:id/organization', [OrganizationsController, 'update']).as('organizations.update')
        router
          .patch('/workspaces/:id/members/:userId/role', [OrganizationMembersController, 'updateRole'])
          .as('organizationMembers.updateRole')
        router
          .delete('/workspaces/:id/members/:userId', [OrganizationMembersController, 'destroy'])
          .as('organizationMembers.destroy')

        router.get('/workspaces/:id/invites', [OrganizationInvitesController, 'index']).as('organizationInvites.index')
        router.post('/workspaces/:id/invites', [OrganizationInvitesController, 'store']).as('organizationInvites.store')
        router
          .post('/workspaces/:id/invites/:inviteId/revoke', [OrganizationInvitesController, 'revoke'])
          .as('organizationInvites.revoke')
      })
      .use([middleware.organizationAccess({ requireAdmin: true })])

    // Global user config (not workspace-scoped)
    router.get('/user-config', [UserConfigController, 'show']).as('userConfig.show')
    router.patch('/user-config', [UserConfigController, 'update']).as('userConfig.update')
  })
  .use([middleware.auth(), middleware.logContext()])

// Workspace routes that sandbox-scoped tokens (`workspace:<id>:sandbox`)
// can access. Each route is guarded by `organizationAccess` to resolve and
// authorize the workspace, then by `tokenWorkspaceScope` which requires the
// token's ability to match the resolved workspace id.
router
  .group(() => {
    router.get('/workspaces/:id/members', [OrganizationMembersController, 'index']).as('organizationMembers.index')
    router.get('/files/signed-url', [FilesController, 'getSignedUrl']).as('files.signedUrl')
    router.post('/workspaces/:id/files', [FilesController, 'upload']).as('workspaces.files.upload')
    router.post('/workspaces/:id/yjs-socket-token', [YjsSocketTokensController, 'store']).as('yjsSocketTokens.store')
  })
  .use([
    middleware.auth({ allowSandboxToken: true }),
    middleware.logContext(),
    middleware.organizationAccess(),
    middleware.tokenWorkspaceScope(),
  ])

router
  .group(() => {
    router
      .get('/shares/:longHashId/socket-access', [DocumentSharesController, 'resolveSocketAccess'])
      .as('documentShares.resolveSocketAccess')
    router.post('/workspaces/:id/document/updated', [WorkspaceDocumentsController, 'notifyDocumentUpdated'])
  })
  .use(middleware.apiKey())

router
  .get('/health', async ({ response }) => {
    return response.ok({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  })
  .as('health')

router.post('/waitlist', [WaitlistController, 'store']).as('waitlist.store')

router
  .get('/', async () => {
    return {
      hello: 'world',
    }
  })
  .as('home')
