import { test } from '@japa/runner'
import sinon from 'sinon'
import { DateTime } from 'luxon'
import PostHogService from '#services/posthog_service'

function createServiceHarness() {
  const identify = sinon.spy()
  const groupIdentify = sinon.spy()
  const capture = sinon.spy()
  const warn = sinon.spy()

  const service = Object.create(PostHogService.prototype) as PostHogService

  Object.assign(service as object, {
    client: {
      identify,
      groupIdentify,
      capture,
    },
    logger: {
      warn,
    },
  })

  return {
    service,
    identify,
    groupIdentify,
    capture,
    warn,
  }
}

test.group('PostHogService', () => {
  test('identifyUser writes standard and custom person properties', async ({ assert }) => {
    const { service, identify } = createServiceHarness()
    const createdAt = DateTime.fromISO('2026-03-15T10:00:00Z')
    const updatedAt = DateTime.fromISO('2026-03-16T10:00:00Z')

    service.identifyUser({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User One',
      createdAt,
      updatedAt,
    })

    assert.lengthOf(identify.args, 1)

    const payload = identify.firstCall.args[0]
    assert.equal(payload.distinctId, 'user-1')
    assert.equal(payload.properties.$set.email, 'user@example.com')
    assert.equal(payload.properties.$set.name, 'User One')
    assert.equal(payload.properties.$set.user_email, 'user@example.com')
    assert.equal(payload.properties.$set.user_name, 'User One')
    assert.equal(payload.properties.$set.user_id, 'user-1')
    assert.equal(payload.properties.$set.user_created_at, createdAt.toISO())
    assert.equal(payload.properties.$set.user_updated_at, updatedAt.toISO())
    assert.isString(payload.properties.$set.last_seen_at)
    assert.isString(payload.properties.$set_once.first_seen_at)
  })

  test('trackWorkspaceViewed identifies users with standard props before capturing the event', async ({ assert }) => {
    const { service, identify, groupIdentify, capture } = createServiceHarness()

    service.trackWorkspaceViewed({
      correlationId: 'corr-1',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User One',
        createdAt: DateTime.fromISO('2026-03-15T10:00:00Z'),
        updatedAt: DateTime.fromISO('2026-03-16T10:00:00Z'),
      },
      workspace: {
        id: 'workspace-1',
        name: 'Workspace One',
        createdAt: DateTime.fromISO('2026-03-15T11:00:00Z'),
        updatedAt: DateTime.fromISO('2026-03-16T11:00:00Z'),
      },
      organization: {
        id: 'org-1',
        name: 'Org One',
        createdAt: DateTime.fromISO('2026-03-15T12:00:00Z'),
        updatedAt: DateTime.fromISO('2026-03-16T12:00:00Z'),
      },
      organizationRole: 'admin',
    })

    assert.lengthOf(identify.args, 1)
    assert.lengthOf(groupIdentify.args, 2)
    assert.lengthOf(capture.args, 1)

    const identifyPayload = identify.firstCall.args[0]
    assert.equal(identifyPayload.properties.$set.email, 'user@example.com')
    assert.equal(identifyPayload.properties.$set.name, 'User One')
    assert.equal(identifyPayload.properties.$set.workspace_id, 'workspace-1')
    assert.equal(identifyPayload.properties.$set.organization_id, 'org-1')

    assert.equal(capture.firstCall.args[0].distinctId, 'user-1')
    assert.equal(capture.firstCall.args[0].event, 'workspace viewed')
  })
})
