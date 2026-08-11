import { test } from '@japa/runner'
import User from '#models/user'
import OAuthAccount from '#models/o_auth_account'
import UserRegistered from '#events/user_registered'
import { GoogleOAuthService } from '#services/google_oauth_service'
import sinon from 'sinon'
import OrganizationMembership from '#models/organization_membership'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { generateSeededPersonName } from '#services/person_name'
import { loadWorkspaceYDoc } from '#tests/helpers/workspace_yjs'

async function createOAuthState(client: any, inviteToken?: string): Promise<string> {
  const request = client.get('/auth/google/url')

  if (inviteToken) {
    request.qs({ inviteToken })
  }

  const response = await request
  response.assertStatus(200)

  const url = new URL(response.body().url)
  const state = url.searchParams.get('state')

  if (!state) {
    throw new Error('Google OAuth URL missing state parameter')
  }

  return state
}

test.group('Google OAuth', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('should return Google OAuth authorization URL', async ({ client, assert }) => {
    const response = await client.get('/auth/google/url')

    response.assertStatus(200)
    assert.exists(response.body().url)
    assert.isString(response.body().url)
    assert.include(response.body().url, 'accounts.google.com')
    assert.include(response.body().url, 'scope')
    assert.include(response.body().url, 'state=')
  })

  test('should create new user with mocked Google OAuth on first login', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const email = `newuser-${suffix}@gmail.com`
    const providerUserId = `google_user_${suffix}`
    const state = await createOAuthState(client)
    const dispatchStub = sinon.stub(UserRegistered, 'dispatch')

    // Mock GoogleOAuthService methods
    const getTokensStub = sinon.stub(GoogleOAuthService.prototype, 'getTokens').resolves({
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      expiry_date: Date.now() + 3600000,
    })

    const getUserInfoStub = sinon.stub(GoogleOAuthService.prototype, 'getUserInfo').resolves({
      id: providerUserId,
      email,
      name: 'New User',
      picture: 'https://example.com/photo.jpg',
    })

    try {
      const response = await client.post('/auth/google/callback').json({
        code: 'mock_authorization_code',
        state,
      })

      response.assertStatus(200)
      response.assertBodyContains({
        type: 'bearer',
      })
      assert.exists(response.body().value)
      assert.isString(response.body().value)

      // Verify user was created
      const user = await User.findBy('email', email)
      assert.exists(user)
      assert.equal(user!.email, email)
      assert.equal(user!.name, 'New User')
      assert.isNull(user!.password, 'OAuth users should have null password')

      // Verify OAuth account was created
      const oauthAccount = await OAuthAccount.query()
        .where('provider', 'google')
        .where('provider_user_id', providerUserId)
        .first()
      assert.exists(oauthAccount)
      assert.equal(oauthAccount!.userId, user!.id)
      assert.equal(oauthAccount!.email, email)

      // Verify workspace was created
      await user!.load('workspaces')
      assert.lengthOf(user!.workspaces, 1, 'New users should have one workspace')
      assert.equal(user!.workspaces[0].name, 'Personal')

      const workspace = user!.workspaces[0]

      assert.isTrue(dispatchStub.calledOnce)
      const [userId, dispatchedEmail, dispatchedName, source, viaInvite, context] = dispatchStub.firstCall
        .args as ConstructorParameters<typeof UserRegistered>

      assert.equal(userId, user!.id)
      assert.equal(dispatchedEmail, user!.email)
      assert.equal(dispatchedName, user!.name)
      assert.equal(source, 'google')
      assert.isFalse(viaInvite)
      assert.equal(context.userId, user!.id)
      assert.equal(context.workspaceId, workspace.id)
      assert.equal(context.organizationId, workspace.organizationId)

      // Verify workspace document has the default starter structure
      const document = loadWorkspaceYDoc(workspace)

      assert.exists(document.proxy.root)
      assert.equal(document.proxy.root.kind, 'canvas')

      const canvases = document.proxy.root.items.filter((i) => i.kind === 'canvas')
      const nodes = document.proxy.root.items.filter((i) => i.kind === 'node')

      assert.lengthOf(canvases, 0, 'Default workspace should not include extra root canvases')
      assert.lengthOf(nodes, 1, 'Default workspace should only include the instructions node')
      const instructionsNode = nodes.find((node) => node.name === 'instructions')
      assert.exists(instructionsNode)
      document.cleanup()
    } finally {
      getTokensStub.restore()
      getUserInfoStub.restore()
    }
  })

  test('should fail without authorization code', async ({ client }) => {
    const response = await client.post('/auth/google/callback').json({})

    response.assertStatus(422)
  })

  test('should fail without OAuth state', async ({ client }) => {
    const response = await client.post('/auth/google/callback').json({
      code: 'mock_authorization_code',
    })

    response.assertStatus(422)
  })

  test('should fallback to deterministic seeded name when Google name is invalid', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const email = `fallback-user-${suffix}@gmail.com`
    const providerUserId = `google_user_fallback_${suffix}`
    const state = await createOAuthState(client)

    const getTokensStub = sinon.stub(GoogleOAuthService.prototype, 'getTokens').resolves({
      access_token: 'mock_access_token_fallback',
      refresh_token: 'mock_refresh_token_fallback',
      expiry_date: Date.now() + 3600000,
    })

    const getUserInfoStub = sinon.stub(GoogleOAuthService.prototype, 'getUserInfo').resolves({
      id: providerUserId,
      email,
      name: String.fromCharCode(1, 2),
      picture: 'https://example.com/fallback.jpg',
    })

    try {
      const response = await client.post('/auth/google/callback').json({
        code: 'mock_authorization_code',
        state,
      })

      response.assertStatus(200)

      const user = await User.findByOrFail('email', email)
      assert.equal(user.name, generateSeededPersonName(email))
    } finally {
      getTokensStub.restore()
      getUserInfoStub.restore()
    }
  })

  test('should use one-time OAuth state to carry invite context', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const inviterEmail = `oauth-inviter-${suffix}@example.com`
    const invitedEmail = `invited-google-user-${suffix}@gmail.com`
    const invitedProviderUserId = `google_user_invited_${suffix}`
    const dispatchStub = sinon.stub(UserRegistered, 'dispatch')

    const inviter = await User.create({
      email: inviterEmail,
      password: 'password123',
    })
    const inviterWorkspace = await createTestWorkspace(inviter, 'OAuth Invite Workspace')

    const loginResponse = await client.post('/auth/login').json({
      email: inviter.email,
      password: 'password123',
    })
    loginResponse.assertStatus(200)

    const createInviteResponse = await client
      .post(`/workspaces/${inviterWorkspace.id}/invites`)
      .bearerToken(loginResponse.body().value)
      .json({ inviteeName: 'Invited By OAuth' })
    createInviteResponse.assertStatus(200)

    const googleUrlResponse = await client
      .get('/auth/google/url')
      .qs({ inviteToken: createInviteResponse.body().token })
    googleUrlResponse.assertStatus(200)

    const redirectUrl = new URL(googleUrlResponse.body().url)
    const state = redirectUrl.searchParams.get('state')
    assert.isString(state)

    const getTokensStub = sinon.stub(GoogleOAuthService.prototype, 'getTokens').resolves({
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      expiry_date: Date.now() + 3600000,
    })

    const getUserInfoStub = sinon.stub(GoogleOAuthService.prototype, 'getUserInfo').resolves({
      id: invitedProviderUserId,
      email: invitedEmail,
      name: 'Invited Google User',
      picture: 'https://example.com/photo.jpg',
    })

    try {
      const callbackResponse = await client.post('/auth/google/callback').json({
        code: 'mock_authorization_code',
        state,
      })

      callbackResponse.assertStatus(200)
      assert.equal(callbackResponse.body().workspaceId, inviterWorkspace.id)

      const invitedUser = await User.findByOrFail('email', invitedEmail)
      assert.equal(invitedUser.name, 'Invited By OAuth')

      assert.isTrue(dispatchStub.calledOnce)
      const [userId, email, name, source, viaInvite, context] = dispatchStub.firstCall.args as ConstructorParameters<
        typeof UserRegistered
      >

      assert.equal(userId, invitedUser.id)
      assert.equal(email, invitedUser.email)
      assert.equal(name, invitedUser.name)
      assert.equal(source, 'google')
      assert.isTrue(viaInvite)
      assert.equal(context.userId, invitedUser.id)
      assert.equal(context.workspaceId, inviterWorkspace.id)
      assert.equal(context.organizationId, inviterWorkspace.organizationId)

      const membership = await OrganizationMembership.query()
        .where('organization_id', inviterWorkspace.organizationId)
        .where('user_id', invitedUser.id)
        .first()

      assert.exists(membership)
      assert.equal(membership!.role, 'member')

      const replayResponse = await client.post('/auth/google/callback').json({
        code: 'mock_authorization_code',
        state,
      })
      replayResponse.assertStatus(400)
      assert.isTrue(dispatchStub.calledOnce)
    } finally {
      getTokensStub.restore()
      getUserInfoStub.restore()
    }
  })

  test('should not dispatch registration event when existing user links Google', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const email = `existing-user-google-${suffix}@gmail.com`
    const providerUserId = `google_existing_user_${suffix}`
    const state = await createOAuthState(client)
    const dispatchStub = sinon.stub(UserRegistered, 'dispatch')

    const existingUser = await User.create({
      email,
      password: 'password123',
      name: 'Existing User',
    })

    const getTokensStub = sinon.stub(GoogleOAuthService.prototype, 'getTokens').resolves({
      access_token: 'mock_access_token_existing',
      refresh_token: 'mock_refresh_token_existing',
      expiry_date: Date.now() + 3600000,
    })

    const getUserInfoStub = sinon.stub(GoogleOAuthService.prototype, 'getUserInfo').resolves({
      id: providerUserId,
      email,
      name: 'Existing User',
      picture: 'https://example.com/photo.jpg',
    })

    try {
      const response = await client.post('/auth/google/callback').json({
        code: 'mock_authorization_code',
        state,
      })

      response.assertStatus(200)
      assert.isTrue(dispatchStub.notCalled)

      const oauthAccount = await OAuthAccount.query()
        .where('provider', 'google')
        .where('provider_user_id', providerUserId)
        .first()

      assert.exists(oauthAccount)
      assert.equal(oauthAccount!.userId, existingUser.id)
    } finally {
      getTokensStub.restore()
      getUserInfoStub.restore()
    }
  })

  test('consumes OAuth state even when callback transaction fails', async ({ client }) => {
    const suffix = Date.now().toString(36)
    const email = `state-replay-${suffix}@gmail.com`
    const providerUserId = `google_user_state_replay_${suffix}`
    const state = await createOAuthState(client)

    const getTokensStub = sinon.stub(GoogleOAuthService.prototype, 'getTokens').resolves({
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      expiry_date: Date.now() + 3600000,
    })

    const getUserInfoStub = sinon.stub(GoogleOAuthService.prototype, 'getUserInfo').resolves({
      id: providerUserId,
      email,
      name: 'State Replay User',
      picture: 'https://example.com/photo.jpg',
    })

    const oauthAccountCreateStub = sinon.stub(OAuthAccount, 'create').rejects(new Error('forced oauth account failure'))
    let restoredOAuthAccountCreateStub = false

    try {
      const failureResponse = await client.post('/auth/google/callback').json({
        code: 'mock_authorization_code',
        state,
      })
      failureResponse.assertStatus(500)

      oauthAccountCreateStub.restore()
      restoredOAuthAccountCreateStub = true

      const replayResponse = await client.post('/auth/google/callback').json({
        code: 'mock_authorization_code',
        state,
      })
      replayResponse.assertStatus(400)
    } finally {
      if (!restoredOAuthAccountCreateStub) {
        oauthAccountCreateStub.restore()
      }
      getTokensStub.restore()
      getUserInfoStub.restore()
    }
  })
})
