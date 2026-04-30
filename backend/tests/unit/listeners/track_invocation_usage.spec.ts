import { test } from '@japa/runner'
import TrackInvocationUsage from '#listeners/track_invocation_usage'
import type OrganizationUsageService from '#services/organization_usage_service'
import InvocationCompleted from '#events/invocation_completed'

test.group('TrackInvocationUsage listener', () => {
  test('fails open when usage sync throws', async ({ assert }) => {
    const failingUsageService = {
      syncCurrentUsagePeriodsForOrganization: async () => {
        throw new Error('PostHog unavailable')
      },
    } as unknown as OrganizationUsageService

    const listener = new TrackInvocationUsage(failingUsageService)
    const event = new InvocationCompleted(
      {
        invocationId: 'invocation-id',
        workspaceId: 'workspace-id',
        organizationId: 'organization-id',
        userId: 'user-id',
        blocked: false,
      },
      {
        correlationId: 'corr-id',
        userId: 'user-id',
        workspaceId: 'workspace-id',
        organizationId: 'organization-id',
      }
    )

    await listener.handle(event)

    assert.isTrue(true)
  })
})
