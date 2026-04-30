import { test } from '@japa/runner'
import sinon from 'sinon'
import User from '#models/user'
import OrganizationMembership from '#models/organization_membership'
import ComposioService, { ToolkitRequiresCustomAuthConfigError } from '#services/composio_service'
import { createTestWorkspace } from '#tests/helpers/workspace'

async function login(client: any, email: string, password: string): Promise<string> {
  const response = await client.post('/auth/login').json({ email, password })
  response.assertStatus(200)
  return response.body().value
}

test.group('Organization member permissions', () => {
  test('allows members to update and duplicate workspaces', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)

    const admin = await User.create({
      email: `member-permissions-admin-${suffix}@example.com`,
      password: 'password123',
    })
    const workspace = await createTestWorkspace(admin, 'Member Editable Workspace')

    const member = await User.create({
      email: `member-permissions-member-${suffix}@example.com`,
      password: 'password123',
    })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const memberToken = await login(client, member.email, 'password123')

    const updateResponse = await client
      .patch(`/workspaces/${workspace.id}`)
      .bearerToken(memberToken)
      .json({ name: 'Renamed by Member' })

    updateResponse.assertStatus(200)
    assert.equal(updateResponse.body().name, 'Renamed by Member')

    const duplicateResponse = await client
      .post(`/workspaces/${workspace.id}/duplicate`)
      .bearerToken(memberToken)
      .json({})

    duplicateResponse.assertStatus(200)
    assert.equal(duplicateResponse.body().name, 'Renamed by Member (Copy)')
    assert.notEqual(duplicateResponse.body().id, workspace.id)
  })

  test('allows members to initiate connections while non-members remain blocked', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)

    const admin = await User.create({
      email: `member-connections-admin-${suffix}@example.com`,
      password: 'password123',
    })
    const workspace = await createTestWorkspace(admin, 'Connection Permissions Workspace')

    const member = await User.create({
      email: `member-connections-member-${suffix}@example.com`,
      password: 'password123',
    })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const outsider = await User.create({
      email: `member-connections-outsider-${suffix}@example.com`,
      password: 'password123',
    })

    const memberToken = await login(client, member.email, 'password123')
    const outsiderToken = await login(client, outsider.email, 'password123')

    const initiateStub = sinon.stub(ComposioService.prototype, 'initiateConnection').resolves({
      redirectUrl: 'https://example.com/oauth',
      connectedAccountId: 'connected-account-123',
    })

    try {
      const memberResponse = await client
        .post(`/workspaces/${workspace.id}/connections/initiate`)
        .bearerToken(memberToken)
        .json({
          toolkit: 'github',
          callbackUrl: 'http://localhost:5173/connections/callback',
        })

      memberResponse.assertStatus(200)
      assert.equal(memberResponse.body().status, 'OK')
      assert.equal(memberResponse.body().redirectUrl, 'https://example.com/oauth')
      assert.equal(memberResponse.body().connectedAccountId, 'connected-account-123')

      const outsiderResponse = await client
        .post(`/workspaces/${workspace.id}/connections/initiate`)
        .bearerToken(outsiderToken)
        .json({
          toolkit: 'github',
          callbackUrl: 'http://localhost:5173/connections/callback',
        })

      outsiderResponse.assertStatus(401)
      outsiderResponse.assertBodyContains({ error: 'Unauthorized' })
    } finally {
      initiateStub.restore()
    }
  })

  test('returns custom auth requirements with 200 when custom auth is required', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)

    const admin = await User.create({
      email: `member-custom-auth-admin-${suffix}@example.com`,
      password: 'password123',
    })
    const workspace = await createTestWorkspace(admin, 'Custom Auth Permissions Workspace')

    const member = await User.create({
      email: `member-custom-auth-member-${suffix}@example.com`,
      password: 'password123',
    })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const memberToken = await login(client, member.email, 'password123')

    const initiateStub = sinon
      .stub(ComposioService.prototype, 'initiateConnection')
      .rejects(new ToolkitRequiresCustomAuthConfigError('posthog'))
    const requirementsStub = sinon.stub(ComposioService.prototype, 'getCustomAuthRequirements').resolves({
      toolkit: 'posthog',
      displayName: 'PostHog',
      composioManagedAuthSchemes: [],
      authModes: [
        {
          mode: 'API_KEY',
          name: 'posthog_apikey',
          authConfigCreation: {
            required: [
              {
                name: 'subdomain',
                displayName: 'Sub Domain',
                type: 'string',
                required: true,
                default: 'us',
                description: 'PostHog subdomain',
              },
            ],
            optional: [],
          },
          connectedAccountInitiation: {
            required: [
              {
                name: 'generic_api_key',
                displayName: 'API Key',
                type: 'string',
                required: true,
                default: null,
                description: 'PostHog API key',
              },
            ],
            optional: [],
          },
        },
      ],
    })

    try {
      const memberResponse = await client
        .post(`/workspaces/${workspace.id}/connections/initiate`)
        .bearerToken(memberToken)
        .json({
          toolkit: 'posthog',
          callbackUrl: 'http://localhost:5173/connections/callback',
        })

      memberResponse.assertStatus(200)
      assert.equal(memberResponse.body().status, 'CUSTOM_AUTH_REQUIRED')
      assert.equal(memberResponse.body().requirements?.toolkit, 'posthog')

      assert.isTrue(requirementsStub.calledOnceWithExactly('posthog'))
      assert.isTrue(initiateStub.calledOnce)
    } finally {
      requirementsStub.restore()
      initiateStub.restore()
    }
  })
})
