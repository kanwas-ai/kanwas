import { BaseEvent } from '@adonisjs/core/events'
import type { EventContext } from '#contracts/event_context'
import type User from '#models/user'
import type Workspace from '#models/workspace'
import type Organization from '#models/organization'
import type { OrganizationRole } from '#models/organization_membership'

export default class WorkspaceViewed extends BaseEvent {
  constructor(
    public user: User,
    public workspace: Workspace,
    public organization: Organization,
    public organizationRole: OrganizationRole,
    public context: EventContext
  ) {
    super()
  }
}
