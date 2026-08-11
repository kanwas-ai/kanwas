import { test } from '@japa/runner'
import sinon from 'sinon'
import UserRegistered from '#events/user_registered'
import SendUserRegistrationSlackNotification from '#listeners/send_user_registration_slack_notification'
import { ContextualLogger } from '#services/contextual_logger'
import SlackWebhookService from '#services/slack_webhook_service'

function buildEvent() {
  return new UserRegistered('user-1', 'new-user@example.com', 'New User', 'google', true, {
    correlationId: 'corr-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    organizationId: 'organization-1',
  })
}

test.group('SendUserRegistrationSlackNotification listener', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('forwards registration payload to Slack webhook service', async ({ assert }) => {
    const sendStub = sinon.stub(SlackWebhookService.prototype, 'sendRegistrationNotification').resolves()
    const listener = new SendUserRegistrationSlackNotification()

    await listener.handle(buildEvent())

    assert.isTrue(sendStub.calledOnce)
    assert.deepEqual(sendStub.firstCall.args[0], {
      name: 'New User',
      email: 'new-user@example.com',
      source: 'google',
      viaInvite: true,
    })
  })

  test('logs and swallows Slack webhook failures', async ({ assert }) => {
    const logger = {
      error: sinon.stub(),
    }

    sinon.stub(ContextualLogger, 'createFallback').returns(logger as any)
    sinon.stub(SlackWebhookService.prototype, 'sendRegistrationNotification').rejects(new Error('boom'))

    const listener = new SendUserRegistrationSlackNotification()

    await listener.handle(buildEvent())

    assert.isTrue(logger.error.calledOnce)
  })
})
