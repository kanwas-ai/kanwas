import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'
import { toError } from '#services/error_utils'

export default class TestUserDelete extends BaseCommand {
  static commandName = 'test:delete-user'
  static description = 'Delete a test user after E2E tests'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Email of the test user to delete' })
  declare email: string

  async run() {
    try {
      const user = await User.findBy('email', this.email)

      if (!user) {
        this.logger.warning(`User ${this.email} not found, nothing to delete`)
        return
      }

      await user.delete()
      this.logger.success(`Deleted test user: ${this.email}`)
    } catch (error) {
      this.logger.error(`Failed to delete test user: ${toError(error).message}`)
      this.exitCode = 1
    }
  }
}
