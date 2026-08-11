import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import { WorkspaceService } from '#services/workspace_service'
import { toError } from '#services/error_utils'

export default class TestUserCreate extends BaseCommand {
  static commandName = 'test:create-user'
  static description = 'Create a test user for E2E tests'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Email for the test user' })
  declare email: string

  @args.string({ description: 'Password for the test user' })
  declare password: string

  async run() {
    try {
      // Check if user already exists
      const existing = await User.findBy('email', this.email)
      if (existing) {
        this.logger.warning(`User ${this.email} already exists, deleting first...`)
        await existing.delete()
      }

      // Get workspace service from container
      const workspaceService = await this.app.container.make(WorkspaceService)

      // Create user with workspace in transaction
      const user = await db.transaction(async (trx) => {
        const newUser = await User.create(
          {
            email: this.email,
            password: this.password,
          },
          { client: trx }
        )
        await workspaceService.createWorkspaceForUser(newUser.id, 'Personal', trx)
        return newUser
      })

      this.logger.success(`Created test user: ${user.email} (id: ${user.id})`)

      // Output JSON for scripts to parse
      console.log(JSON.stringify({ id: user.id, email: user.email }))
    } catch (error) {
      this.logger.error(`Failed to create test user: ${toError(error).message}`)
      this.exitCode = 1
    }
  }
}
