import router from '@adonisjs/core/services/router'

// Admin is an optional workspace package. The public mirror strips it, so
// this dynamic import fails with ERR_MODULE_NOT_FOUND at runtime there and
// we quietly skip registering admin routes. Using an indirect specifier
// keeps TypeScript from hard-resolving the module at typecheck time so the
// stripped mirror still compiles.
const adminBackendSpecifier: string = 'admin-backend'

interface AdminBackendModule {
  registerAdminModule(ctx: { router: typeof router }): void
}

try {
  const plugin = (await import(adminBackendSpecifier)) as AdminBackendModule
  plugin.registerAdminModule({ router })
} catch (error) {
  const nodeError = error as NodeJS.ErrnoException
  if (nodeError.code !== 'ERR_MODULE_NOT_FOUND' && nodeError.code !== 'MODULE_NOT_FOUND') {
    throw error
  }
}
