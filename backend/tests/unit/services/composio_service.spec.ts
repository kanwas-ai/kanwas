import { test } from '@japa/runner'
import sinon from 'sinon'
import ComposioService, {
  ConnectionNotInWorkspaceError,
  InvalidConnectionCallbackUrlError,
  InvalidCustomAuthConfigError,
  ToolkitRequiredError,
} from '#services/composio_service'

type ComposioStub = {
  create: sinon.SinonStub
  toolkits: {
    get: sinon.SinonStub
  }
  authConfigs: {
    list: sinon.SinonStub
    create: sinon.SinonStub
    get: sinon.SinonStub
    delete: sinon.SinonStub
  }
  connectedAccounts: {
    link: sinon.SinonStub
    list: sinon.SinonStub
    delete: sinon.SinonStub
    get: sinon.SinonStub
  }
}

function createComposioStub(): ComposioStub {
  return {
    create: sinon.stub(),
    toolkits: {
      get: sinon.stub().resolves([]),
    },
    authConfigs: {
      list: sinon.stub().resolves({ items: [], nextCursor: undefined }),
      create: sinon.stub(),
      get: sinon.stub(),
      delete: sinon.stub(),
    },
    connectedAccounts: {
      link: sinon.stub(),
      list: sinon.stub().resolves({ items: [], nextCursor: undefined }),
      delete: sinon.stub(),
      get: sinon.stub(),
    },
  }
}

function createService(overrides?: { composio?: ComposioStub }) {
  const composio = overrides?.composio ?? createComposioStub()

  const service = new ComposioService()
  ;(service as any).composio = composio

  return { service, composio }
}

test.group('ComposioService', () => {
  test('rejects callback URLs outside the allowlist', async ({ assert }) => {
    const { service } = createService()

    let caughtError: unknown

    try {
      await service.initiateConnection('user-1', 'workspace-1', {
        toolkit: 'github',
        callbackUrl: 'https://evil.example.com/connections/callback',
      })
    } catch (error) {
      caughtError = error
    }

    assert.instanceOf(caughtError, InvalidConnectionCallbackUrlError)
  })

  test('uses session.authorize for managed auth flow', async ({ assert }) => {
    const { service, composio } = createService()
    const authorize = sinon.stub().resolves({
      id: 'conn_managed',
      redirectUrl: 'https://example.com/managed',
    })

    composio.create.resolves({ authorize, toolkits: sinon.stub() })

    const result = await service.initiateConnection('user-1', 'workspace-1', {
      toolkit: 'notion',
      callbackUrl: 'https://app.kanwas.ai/connections/callback',
    })

    assert.deepEqual(result, {
      redirectUrl: 'https://example.com/managed',
      connectedAccountId: 'conn_managed',
    })

    assert.isTrue(
      composio.create.calledOnceWithExactly('u_user-1_w_workspace-1', {
        manageConnections: false,
      })
    )
    assert.isTrue(
      authorize.calledOnceWithExactly('notion', {
        callbackUrl: 'https://app.kanwas.ai/connections/callback',
      })
    )
    assert.isTrue(composio.connectedAccounts.link.notCalled)
  })

  test('requires toolkit for initiate requests', async ({ assert }) => {
    const { service } = createService()

    let caughtError: unknown

    try {
      await service.initiateConnection('user-1', 'workspace-1', {
        toolkit: '  ',
        callbackUrl: 'https://app.kanwas.ai/connections/callback',
      })
    } catch (error) {
      caughtError = error
    }

    assert.instanceOf(caughtError, ToolkitRequiredError)
  })

  test('maps toolkit connection details and handles cursor pagination', async ({ assert }) => {
    const { service, composio } = createService()

    const toolkits = sinon.stub()
    toolkits.onFirstCall().resolves({
      items: [
        {
          slug: 'github',
          name: 'GitHub',
          logo: 'https://logos.composio.dev/api/github',
          isNoAuth: false,
          connection: {
            isActive: true,
            authConfig: {
              id: 'ac_custom_github',
              mode: 'use_custom_auth',
              isComposioManaged: false,
            },
            connectedAccount: {
              id: 'ca_github_1',
              status: 'ACTIVE',
            },
          },
        },
        {
          slug: 'hackernews',
          name: 'Hacker News',
          logo: 'https://logos.composio.dev/api/hackernews',
          isNoAuth: true,
        },
      ],
      nextCursor: 'cursor_2',
    })

    toolkits.onSecondCall().resolves({
      items: [
        {
          slug: 'slack',
          name: 'Slack',
          logo: 'https://logos.composio.dev/api/slack',
          isNoAuth: false,
          connection: {
            isActive: false,
            authConfig: {
              id: 'ac_managed_slack',
              mode: 'use_composio_managed_auth',
              isComposioManaged: true,
            },
          },
        },
      ],
      nextCursor: undefined,
    })

    composio.create.resolves({
      authorize: sinon.stub(),
      toolkits,
    })
    composio.connectedAccounts.list.resolves({
      items: [
        {
          id: 'ca_github_1',
          status: 'ACTIVE',
          toolkit: { slug: 'github' },
          authConfig: {
            id: 'ac_custom_github',
            isComposioManaged: false,
          },
        },
      ],
      nextCursor: undefined,
    })

    const connections = await service.listConnections('user-1', 'workspace-1')

    assert.lengthOf(connections, 3)
    assert.deepEqual(connections[0], {
      toolkit: 'github',
      displayName: 'GitHub',
      logo: 'https://logos.composio.dev/api/github',
      isConnected: true,
      connectedAccountId: 'ca_github_1',
      connectedAccountStatus: 'ACTIVE',
      authConfigId: 'ac_custom_github',
      authMode: 'use_custom_auth',
      isComposioManaged: false,
      isNoAuth: false,
    })
    assert.deepEqual(connections[1], {
      toolkit: 'hackernews',
      displayName: 'Hacker News',
      logo: 'https://logos.composio.dev/api/hackernews',
      isConnected: true,
      connectedAccountId: undefined,
      connectedAccountStatus: undefined,
      authConfigId: undefined,
      authMode: undefined,
      isComposioManaged: undefined,
      isNoAuth: true,
    })
    assert.deepEqual(connections[2], {
      toolkit: 'slack',
      displayName: 'Slack',
      logo: 'https://logos.composio.dev/api/slack',
      isConnected: false,
      connectedAccountId: undefined,
      connectedAccountStatus: undefined,
      authConfigId: 'ac_managed_slack',
      authMode: 'use_composio_managed_auth',
      isComposioManaged: true,
      isNoAuth: false,
    })

    assert.isTrue(
      composio.create.calledOnceWithExactly('u_user-1_w_workspace-1', {
        manageConnections: false,
      })
    )
    assert.isTrue(toolkits.firstCall.calledWithExactly({ limit: 50, nextCursor: undefined }))
    assert.isTrue(toolkits.secondCall.calledWithExactly({ limit: 50, nextCursor: 'cursor_2' }))
    assert.isTrue(
      composio.connectedAccounts.list.calledOnceWithExactly({
        userIds: ['u_user-1_w_workspace-1'],
        cursor: undefined,
        limit: 200,
        statuses: ['ACTIVE'],
      })
    )
  })

  test('treats ACTIVE connected accounts as connected even when isActive is false', async ({ assert }) => {
    const { service, composio } = createService()

    const toolkits = sinon.stub().resolves({
      items: [
        {
          slug: 'posthog',
          name: 'PostHog',
          logo: 'https://logos.composio.dev/api/posthog',
          isNoAuth: false,
          connection: {
            isActive: false,
            connectedAccount: {
              id: 'ca_posthog',
              status: 'ACTIVE',
            },
          },
        },
      ],
      nextCursor: undefined,
    })

    composio.create.resolves({ authorize: sinon.stub(), toolkits })
    composio.connectedAccounts.list.resolves({
      items: [
        {
          id: 'ca_posthog',
          status: 'ACTIVE',
          toolkit: { slug: 'posthog' },
        },
      ],
      nextCursor: undefined,
    })

    const connections = await service.listConnections('user-1', 'workspace-1')

    assert.lengthOf(connections, 1)
    assert.equal(connections[0].toolkit, 'posthog')
    assert.equal(connections[0].isConnected, true)
    assert.equal(connections[0].connectedAccountStatus, 'ACTIVE')
  })

  test('applies toolkit listing filters locally using normalized mapped statuses', async ({ assert }) => {
    const { service, composio } = createService()
    const toolkits = sinon.stub().resolves({
      items: [
        {
          slug: 'github',
          name: 'GitHub',
          isNoAuth: false,
          connection: {
            isActive: false,
            connectedAccount: {
              id: 'ca_github',
              status: 'ACTIVE',
            },
          },
        },
        {
          slug: 'slack',
          name: 'Slack',
          isNoAuth: false,
          connection: {
            isActive: false,
            connectedAccount: {
              id: 'ca_slack',
              status: 'INITIATED',
            },
          },
        },
      ],
      nextCursor: undefined,
    })
    composio.create.resolves({ authorize: sinon.stub(), toolkits })
    composio.connectedAccounts.list.resolves({
      items: [
        {
          id: 'ca_github',
          status: 'ACTIVE',
          toolkit: { slug: 'github' },
        },
      ],
      nextCursor: undefined,
    })

    const results = await service.listToolkits('user-1', 'workspace-1', {
      isConnected: true,
      search: ' github ',
    })

    assert.isTrue(
      toolkits.calledOnceWithExactly({
        limit: 50,
        nextCursor: undefined,
        search: 'github',
        isConnected: true,
      })
    )
    assert.lengthOf(results, 1)
    assert.equal(results[0].toolkit, 'github')
    assert.equal(results[0].isConnected, true)
  })

  test('shows installed toolkits only when connected account status is ACTIVE', async ({ assert }) => {
    const { service, composio } = createService()

    const toolkits = sinon.stub().resolves({
      items: [
        {
          slug: 'posthog',
          name: 'PostHog',
          isNoAuth: false,
          connection: {
            isActive: true,
            connectedAccount: {
              id: 'ca_posthog',
              status: 'INITIATED',
            },
          },
        },
      ],
      nextCursor: undefined,
    })

    composio.create.resolves({ authorize: sinon.stub(), toolkits })
    composio.connectedAccounts.list.resolves({
      items: [
        {
          id: 'ca_posthog',
          status: 'INITIATED',
          toolkit: { slug: 'posthog' },
        },
      ],
      nextCursor: undefined,
    })

    const installedToolkits = await service.listToolkits('user-1', 'workspace-1', { isConnected: true })

    assert.lengthOf(installedToolkits, 0)
  })

  test('adds ACTIVE connected toolkits missing from session toolkit listing', async ({ assert }) => {
    const { service, composio } = createService()

    const toolkits = sinon.stub().resolves({
      items: [
        {
          slug: 'github',
          name: 'GitHub',
          isNoAuth: false,
        },
      ],
      nextCursor: undefined,
    })

    composio.create.resolves({ authorize: sinon.stub(), toolkits })
    composio.connectedAccounts.list.resolves({
      items: [
        {
          id: 'ca_posthog',
          status: 'ACTIVE',
          toolkit: { slug: 'posthog' },
          authConfig: {
            id: 'ac_posthog',
            isComposioManaged: false,
          },
        },
      ],
      nextCursor: undefined,
    })

    const connectedToolkits = await service.listWorkspaceConnectedToolkits('user-1', 'workspace-1')

    assert.isTrue(
      toolkits.calledOnceWithExactly({
        limit: 50,
        nextCursor: undefined,
        isConnected: true,
      })
    )

    assert.deepEqual(connectedToolkits, [
      {
        toolkit: 'posthog',
        displayName: 'posthog',
        isConnected: true,
        connectedAccountId: 'ca_posthog',
        connectedAccountStatus: 'ACTIVE',
        authConfigId: 'ac_posthog',
        authMode: undefined,
        isComposioManaged: false,
        isNoAuth: false,
      },
    ])
  })

  test('excludes Test App tagged with Tag1 and Tag2 from toolkit listings', async ({ assert }) => {
    const { service, composio } = createService()

    const toolkits = sinon.stub().resolves({
      items: [
        {
          slug: 'test-app',
          name: 'Test App',
          logo: 'https://logos.composio.dev/api/test-app',
          categories: [
            { slug: 'tag1', name: 'Tag1' },
            { slug: 'tag2', name: 'Tag2' },
          ],
          isNoAuth: false,
        },
        {
          slug: 'github',
          name: 'GitHub',
          logo: 'https://logos.composio.dev/api/github',
          isNoAuth: false,
          categories: [{ slug: 'developer-tools', name: 'Developer Tools' }],
        },
      ],
      nextCursor: undefined,
    })

    composio.create.resolves({ authorize: sinon.stub(), toolkits })

    const result = await service.listToolkits('user-1', 'workspace-1')

    assert.deepEqual(result, [
      {
        toolkit: 'github',
        displayName: 'GitHub',
        logo: 'https://logos.composio.dev/api/github',
        categories: [{ slug: 'developer-tools', name: 'Developer Tools' }],
        isConnected: false,
        connectedAccountId: undefined,
        connectedAccountStatus: undefined,
        authConfigId: undefined,
        authMode: undefined,
        isComposioManaged: undefined,
        isNoAuth: false,
      },
    ])
  })

  test('loads global toolkit catalog using shared identity and strips connection-specific fields', async ({
    assert,
  }) => {
    const { service, composio } = createService()

    composio.toolkits.get.resolves([
      {
        slug: 'github',
        name: 'GitHub',
        noAuth: false,
        meta: {
          logo: 'https://assets.composio.dev/logos/github.png',
          description: 'Connect GitHub repositories and issues.',
          categories: [
            { slug: 'developer-tools', name: 'Developer Tools' },
            { id: 'source-control', name: 'Source Control' },
          ],
        },
      },
      {
        slug: 'hackernews',
        name: 'Hacker News',
        noAuth: true,
        meta: {
          description: 'Read top stories from Hacker News.',
          categories: [{ slug: 'news', name: 'News' }],
        },
      },
    ])

    const toolkits = sinon.stub().resolves({
      items: [
        {
          slug: 'github',
          name: 'GitHub',
          logo: 'https://logos.composio.dev/api/github',
          isNoAuth: false,
          connection: {
            isActive: true,
            connectedAccount: {
              id: 'ca_should_be_removed',
              status: 'ACTIVE',
            },
            authConfig: {
              id: 'ac_should_be_removed',
              mode: 'use_custom_auth',
              isComposioManaged: false,
            },
          },
        },
        {
          slug: 'hackernews',
          name: 'Hacker News',
          logo: 'https://logos.composio.dev/api/hackernews',
          isNoAuth: true,
        },
      ],
      nextCursor: undefined,
    })

    composio.create.resolves({ authorize: sinon.stub(), toolkits })

    const result = await service.listGlobalToolkitCatalog()

    assert.deepEqual(result, [
      {
        toolkit: 'github',
        displayName: 'GitHub',
        logo: 'https://logos.composio.dev/api/github',
        description: 'Connect GitHub repositories and issues.',
        categories: [
          { slug: 'developer-tools', name: 'Developer Tools' },
          { slug: 'source-control', name: 'Source Control' },
        ],
        isConnected: false,
        connectedAccountId: undefined,
        connectedAccountStatus: undefined,
        authConfigId: undefined,
        authMode: undefined,
        isComposioManaged: undefined,
        isNoAuth: false,
      },
      {
        toolkit: 'hackernews',
        displayName: 'Hacker News',
        logo: 'https://logos.composio.dev/api/hackernews',
        description: 'Read top stories from Hacker News.',
        categories: [{ slug: 'news', name: 'News' }],
        isConnected: true,
        connectedAccountId: undefined,
        connectedAccountStatus: undefined,
        authConfigId: undefined,
        authMode: undefined,
        isComposioManaged: undefined,
        isNoAuth: true,
      },
    ])

    assert.isTrue(
      composio.create.calledOnceWithExactly('global_toolkit_catalog', {
        manageConnections: false,
      })
    )
    assert.isTrue(composio.toolkits.get.calledOnceWithExactly({ limit: 1000 }))
  })

  test('merges cached catalog with live workspace connection details', async ({ assert }) => {
    const { service } = createService()

    const merged = service.mergeCatalogWithWorkspaceConnections(
      [
        {
          toolkit: 'github',
          displayName: 'GitHub',
          logo: 'https://logos.composio.dev/api/github',
          isConnected: false,
          isNoAuth: false,
        },
        {
          toolkit: 'hackernews',
          displayName: 'Hacker News',
          logo: 'https://logos.composio.dev/api/hackernews',
          isConnected: true,
          isNoAuth: true,
        },
      ],
      [
        {
          toolkit: 'github',
          displayName: 'GitHub',
          logo: 'https://logos.composio.dev/api/github',
          isConnected: true,
          connectedAccountId: 'ca_github',
          connectedAccountStatus: 'ACTIVE',
          authConfigId: 'ac_github',
          authMode: 'use_custom_auth',
          isComposioManaged: false,
          isNoAuth: false,
        },
        {
          toolkit: 'slack',
          displayName: 'Slack',
          logo: 'https://logos.composio.dev/api/slack',
          isConnected: true,
          connectedAccountId: 'ca_slack',
          connectedAccountStatus: 'ACTIVE',
          authConfigId: 'ac_slack',
          authMode: 'use_composio_managed_auth',
          isComposioManaged: true,
          isNoAuth: false,
        },
      ]
    )

    assert.deepEqual(merged, [
      {
        toolkit: 'github',
        displayName: 'GitHub',
        logo: 'https://logos.composio.dev/api/github',
        isConnected: true,
        connectedAccountId: 'ca_github',
        connectedAccountStatus: 'ACTIVE',
        authConfigId: 'ac_github',
        authMode: 'use_custom_auth',
        isComposioManaged: false,
        isNoAuth: false,
      },
      {
        toolkit: 'hackernews',
        displayName: 'Hacker News',
        logo: 'https://logos.composio.dev/api/hackernews',
        isConnected: true,
        connectedAccountId: undefined,
        connectedAccountStatus: undefined,
        authConfigId: undefined,
        authMode: undefined,
        isComposioManaged: undefined,
        isNoAuth: true,
      },
      {
        toolkit: 'slack',
        displayName: 'Slack',
        logo: 'https://logos.composio.dev/api/slack',
        isConnected: true,
        connectedAccountId: 'ca_slack',
        connectedAccountStatus: 'ACTIVE',
        authConfigId: 'ac_slack',
        authMode: 'use_composio_managed_auth',
        isComposioManaged: true,
        isNoAuth: false,
      },
    ])
  })

  test('excludes Test App tagged with Tag1 and Tag2 when merging catalog and workspace', async ({ assert }) => {
    const { service } = createService()

    const merged = service.mergeCatalogWithWorkspaceConnections(
      [
        {
          toolkit: 'test-app',
          displayName: 'Test App',
          categories: [
            { slug: 'tag1', name: 'Tag1' },
            { slug: 'tag2', name: 'Tag2' },
          ],
          isConnected: false,
          isNoAuth: false,
        },
        {
          toolkit: 'github',
          displayName: 'GitHub',
          logo: 'https://logos.composio.dev/api/github',
          isConnected: false,
          isNoAuth: false,
        },
      ],
      [
        {
          toolkit: 'test-app',
          displayName: 'TEST APP',
          categories: [
            { slug: 'tag1', name: 'Tag1' },
            { slug: 'tag2', name: 'Tag2' },
          ],
          isConnected: true,
          connectedAccountId: 'ca_test_app',
          connectedAccountStatus: 'ACTIVE',
          authConfigId: 'ac_test_app',
          authMode: 'use_custom_auth',
          isComposioManaged: false,
          isNoAuth: false,
        },
        {
          toolkit: 'github',
          displayName: 'GitHub',
          logo: 'https://logos.composio.dev/api/github',
          isConnected: true,
          connectedAccountId: 'ca_github',
          connectedAccountStatus: 'ACTIVE',
          authConfigId: 'ac_github',
          authMode: 'use_custom_auth',
          isComposioManaged: false,
          isNoAuth: false,
        },
      ]
    )

    assert.deepEqual(merged, [
      {
        toolkit: 'github',
        displayName: 'GitHub',
        logo: 'https://logos.composio.dev/api/github',
        isConnected: true,
        connectedAccountId: 'ca_github',
        connectedAccountStatus: 'ACTIVE',
        authConfigId: 'ac_github',
        authMode: 'use_custom_auth',
        isComposioManaged: false,
        isNoAuth: false,
      },
    ])
  })

  test('normalizes toolkit custom auth requirements from Composio metadata', async ({ assert }) => {
    const { service, composio } = createService()

    composio.toolkits.get.resolves({
      slug: 'posthog',
      name: 'PostHog',
      composioManagedAuthSchemes: ['oauth2', 'api_key'],
      authConfigDetails: [
        {
          mode: 'api_key',
          name: 'API Key',
          fields: {
            authConfigCreation: {
              required: [
                {
                  name: 'api_key',
                  displayName: 'API Key',
                  type: 'string',
                  required: true,
                  description: 'Personal API key',
                },
                {
                  name: 'project_api_key',
                  required: true,
                },
              ],
              optional: [
                {
                  name: 'subdomain',
                  displayName: 'Subdomain',
                  default: 'demo',
                },
              ],
            },
            connectedAccountInitiation: {
              required: [{ name: 'region', displayName: 'Region', required: true }],
            },
          },
        },
      ],
    })

    const requirements = await service.getCustomAuthRequirements(' PostHog ')

    assert.equal(requirements.toolkit, 'posthog')
    assert.equal(requirements.displayName, 'PostHog')
    assert.deepEqual(requirements.composioManagedAuthSchemes, ['OAUTH2', 'API_KEY'])
    assert.lengthOf(requirements.authModes, 1)
    assert.deepEqual(requirements.authModes[0], {
      mode: 'API_KEY',
      name: 'API Key',
      authConfigCreation: {
        required: [
          {
            name: 'api_key',
            displayName: 'API Key',
            type: 'string',
            required: true,
            default: null,
            description: 'Personal API key',
          },
          {
            name: 'project_api_key',
            displayName: 'project_api_key',
            type: 'string',
            required: true,
            default: null,
            description: '',
          },
        ],
        optional: [
          {
            name: 'subdomain',
            displayName: 'Subdomain',
            type: 'string',
            required: false,
            default: 'demo',
            description: '',
            uiHints: {
              control: 'select',
              options: [
                {
                  value: 'us.i',
                  label: 'US Cloud (public)',
                },
                {
                  value: 'eu.i',
                  label: 'EU Cloud (public)',
                },
                {
                  value: 'us',
                  label: 'US Cloud (private)',
                },
                {
                  value: 'eu',
                  label: 'EU Cloud (private)',
                },
              ],
              allowCustomValue: true,
              preferredDefaultValue: 'us.i',
              customValuePlaceholder: 'mycompany',
              helpText: 'For self-hosted PostHog, enter your custom subdomain.',
            },
          },
        ],
      },
      connectedAccountInitiation: {
        required: [
          {
            name: 'region',
            displayName: 'Region',
            type: 'string',
            required: true,
            default: null,
            description: '',
          },
        ],
        optional: [],
      },
    })
  })

  test('always creates a fresh custom auth config for custom auth flows', async ({ assert }) => {
    const { service, composio } = createService()
    composio.toolkits.get.resolves({
      slug: 'posthog',
      authConfigDetails: [
        {
          mode: 'API_KEY',
          name: 'API Key',
          fields: {
            authConfigCreation: {
              required: [{ name: 'api_key', displayName: 'API Key', required: true }],
              optional: [],
            },
          },
        },
      ],
    })
    composio.authConfigs.create.onFirstCall().resolves({ id: 'ac_created_1' })
    composio.authConfigs.create.onSecondCall().resolves({ id: 'ac_created_2' })
    composio.connectedAccounts.link.onFirstCall().resolves({ id: 'ca_created_1', redirectUrl: 'https://example.com/1' })
    composio.connectedAccounts.link
      .onSecondCall()
      .resolves({ id: 'ca_created_2', redirectUrl: 'https://example.com/2' })

    const first = await service.initiateConnection('user-1', 'workspace-1', {
      toolkit: 'posthog',
      callbackUrl: 'https://app.kanwas.ai/connections/callback',
      customAuth: {
        mode: 'API_KEY',
        credentials: {
          api_key: 'new-key',
        },
      },
    })

    const second = await service.initiateConnection('user-1', 'workspace-1', {
      toolkit: 'posthog',
      callbackUrl: 'https://app.kanwas.ai/connections/callback',
      customAuth: {
        mode: 'API_KEY',
        credentials: {
          api_key: 'new-key',
        },
      },
    })

    assert.deepEqual(first, {
      redirectUrl: 'https://example.com/1',
      connectedAccountId: 'ca_created_1',
    })
    assert.deepEqual(second, {
      redirectUrl: 'https://example.com/2',
      connectedAccountId: 'ca_created_2',
    })

    assert.isTrue(composio.authConfigs.list.notCalled)
    assert.equal(composio.authConfigs.create.callCount, 2)

    const firstCreate = composio.authConfigs.create.firstCall.args
    const secondCreate = composio.authConfigs.create.secondCall.args
    assert.equal(firstCreate[0], 'posthog')
    assert.equal(secondCreate[0], 'posthog')
    assert.equal(firstCreate[1].type, 'use_custom_auth')
    assert.equal(firstCreate[1].authScheme, 'API_KEY')
    assert.equal(firstCreate[1].credentials.api_key, 'new-key')
    assert.equal(secondCreate[1].credentials.api_key, 'new-key')
    assert.match(firstCreate[1].name, /^kanwas_custom_auth_posthog_api_key_[a-f0-9]{16}$/)
    assert.match(secondCreate[1].name, /^kanwas_custom_auth_posthog_api_key_[a-f0-9]{16}$/)
    assert.notEqual(firstCreate[1].name, secondCreate[1].name)

    assert.isTrue(
      composio.connectedAccounts.link.firstCall.calledWithExactly('u_user-1_w_workspace-1', 'ac_created_1', {
        callbackUrl: 'https://app.kanwas.ai/connections/callback',
      })
    )
    assert.isTrue(
      composio.connectedAccounts.link.secondCall.calledWithExactly('u_user-1_w_workspace-1', 'ac_created_2', {
        callbackUrl: 'https://app.kanwas.ai/connections/callback',
      })
    )
  })

  test('rejects invalid custom auth payload when required fields are missing', async ({ assert }) => {
    const { service, composio } = createService()
    composio.toolkits.get.resolves({
      slug: 'posthog',
      authConfigDetails: [
        {
          mode: 'API_KEY',
          name: 'API Key',
          fields: {
            authConfigCreation: {
              required: [{ name: 'api_key', displayName: 'API Key', required: true }],
              optional: [],
            },
          },
        },
      ],
    })

    let caughtError: unknown

    try {
      await service.initiateConnection('user-1', 'workspace-1', {
        toolkit: 'posthog',
        callbackUrl: 'https://app.kanwas.ai/connections/callback',
        customAuth: {
          mode: 'API_KEY',
          credentials: {},
        },
      })
    } catch (error) {
      caughtError = error
    }

    assert.instanceOf(caughtError, InvalidCustomAuthConfigError)
    assert.match((caughtError as Error).message, /Missing required custom auth fields: API Key/)
    assert.isTrue(composio.authConfigs.create.notCalled)
    assert.isTrue(composio.connectedAccounts.link.notCalled)
  })

  test('preserves custom auth credential values without trimming', async ({ assert }) => {
    const { service, composio } = createService()
    composio.toolkits.get.resolves({
      slug: 'posthog',
      authConfigDetails: [
        {
          mode: 'API_KEY',
          name: 'API Key',
          fields: {
            authConfigCreation: {
              required: [{ name: 'api_key', displayName: 'API Key', required: true }],
              optional: [],
            },
          },
        },
      ],
    })
    composio.authConfigs.create.resolves({ id: 'ac_created_1' })
    composio.connectedAccounts.link.resolves({ id: 'ca_created_1', redirectUrl: 'https://example.com/1' })

    await service.initiateConnection('user-1', 'workspace-1', {
      toolkit: 'posthog',
      callbackUrl: 'https://app.kanwas.ai/connections/callback',
      customAuth: {
        mode: 'API_KEY',
        credentials: {
          api_key: '  sk-test-with-padding  ',
        },
      },
    })

    const createArgs = composio.authConfigs.create.firstCall.args
    assert.equal(createArgs[1].credentials.api_key, '  sk-test-with-padding  ')
  })

  test('deletes freshly created custom auth config when link initiation fails', async ({ assert }) => {
    const { service, composio } = createService()
    composio.toolkits.get.resolves({
      slug: 'posthog',
      authConfigDetails: [
        {
          mode: 'API_KEY',
          name: 'API Key',
          fields: {
            authConfigCreation: {
              required: [{ name: 'api_key', displayName: 'API Key', required: true }],
              optional: [],
            },
          },
        },
      ],
    })
    composio.authConfigs.create.resolves({ id: 'ac_created_1' })
    composio.connectedAccounts.link.rejects(new Error('Link failed'))

    let caughtError: unknown

    try {
      await service.initiateConnection('user-1', 'workspace-1', {
        toolkit: 'posthog',
        callbackUrl: 'https://app.kanwas.ai/connections/callback',
        customAuth: {
          mode: 'API_KEY',
          credentials: {
            api_key: 'new-key',
          },
        },
      })
    } catch (error) {
      caughtError = error
    }

    assert.instanceOf(caughtError, Error)
    assert.equal((caughtError as Error).message, 'Link failed')
    assert.isTrue(composio.authConfigs.delete.calledOnceWithExactly('ac_created_1'))
  })

  test('disconnects only when connected account belongs to workspace identity', async ({ assert }) => {
    const { service, composio } = createService()
    composio.connectedAccounts.list.resolves({
      items: [{ id: 'ca_owned' }],
      nextCursor: undefined,
    })

    await service.disconnectForWorkspace('user-1', 'workspace-1', 'ca_owned')

    assert.isTrue(
      composio.connectedAccounts.list.calledOnceWithExactly({
        userIds: ['u_user-1_w_workspace-1'],
        cursor: undefined,
        limit: 200,
        statuses: ['INITIALIZING', 'INITIATED', 'ACTIVE', 'FAILED', 'EXPIRED', 'INACTIVE'],
      })
    )
    assert.isTrue(composio.connectedAccounts.delete.calledOnceWithExactly('ca_owned'))
  })

  test('cleans up Kanwas custom auth configs on disconnect', async ({ assert }) => {
    const { service, composio } = createService()
    composio.connectedAccounts.list.resolves({
      items: [{ id: 'ca_owned' }],
      nextCursor: undefined,
    })
    composio.connectedAccounts.get.resolves({
      id: 'ca_owned',
      authConfig: {
        id: 'ac_kanwas_1',
        name: 'kanwas_custom_auth_posthog_api_key_1234abcd5678ef90',
        isComposioManaged: false,
      },
    })

    await service.disconnectForWorkspace('user-1', 'workspace-1', 'ca_owned')

    assert.isTrue(composio.connectedAccounts.delete.calledOnceWithExactly('ca_owned'))
    assert.isTrue(composio.authConfigs.delete.calledOnceWithExactly('ac_kanwas_1'))
    assert.isTrue(composio.authConfigs.get.notCalled)
  })

  test('resolves auth config name before cleanup when connected account omits it', async ({ assert }) => {
    const { service, composio } = createService()
    composio.connectedAccounts.list.resolves({
      items: [{ id: 'ca_owned' }],
      nextCursor: undefined,
    })
    composio.connectedAccounts.get.resolves({
      id: 'ca_owned',
      authConfig: {
        id: 'ac_kanwas_2',
        isComposioManaged: false,
      },
    })
    composio.authConfigs.get.resolves({
      id: 'ac_kanwas_2',
      name: 'kanwas_custom_auth_notion_oauth2_1234abcd5678ef90',
    })

    await service.disconnectForWorkspace('user-1', 'workspace-1', 'ca_owned')

    assert.isTrue(composio.connectedAccounts.delete.calledOnceWithExactly('ca_owned'))
    assert.isTrue(composio.authConfigs.get.calledOnceWithExactly('ac_kanwas_2'))
    assert.isTrue(composio.authConfigs.delete.calledOnceWithExactly('ac_kanwas_2'))
  })

  test('does not delete non-Kanwas auth configs on disconnect', async ({ assert }) => {
    const { service, composio } = createService()
    composio.connectedAccounts.list.resolves({
      items: [{ id: 'ca_owned' }],
      nextCursor: undefined,
    })
    composio.connectedAccounts.get.resolves({
      id: 'ca_owned',
      authConfig: {
        id: 'ac_external',
        name: 'my_existing_auth_config',
        isComposioManaged: false,
      },
    })

    await service.disconnectForWorkspace('user-1', 'workspace-1', 'ca_owned')

    assert.isTrue(composio.connectedAccounts.delete.calledOnceWithExactly('ca_owned'))
    assert.isTrue(composio.authConfigs.delete.notCalled)
  })

  test('falls back to identity listing without statuses when explicit status filter is unsupported', async ({
    assert,
  }) => {
    const { service, composio } = createService()
    composio.connectedAccounts.list.onFirstCall().rejects(new Error('Invalid status filter'))
    composio.connectedAccounts.list.onSecondCall().resolves({
      items: [{ id: 'ca_owned' }],
      nextCursor: undefined,
    })

    await service.disconnectForWorkspace('user-1', 'workspace-1', 'ca_owned')

    assert.deepEqual(composio.connectedAccounts.list.firstCall.args[0], {
      userIds: ['u_user-1_w_workspace-1'],
      cursor: undefined,
      limit: 200,
      statuses: ['INITIALIZING', 'INITIATED', 'ACTIVE', 'FAILED', 'EXPIRED', 'INACTIVE'],
    })
    assert.deepEqual(composio.connectedAccounts.list.secondCall.args[0], {
      userIds: ['u_user-1_w_workspace-1'],
      cursor: undefined,
      limit: 200,
    })
    assert.isTrue(composio.connectedAccounts.delete.calledOnceWithExactly('ca_owned'))
  })

  test('does not fallback to unfiltered listing for unrelated connected account list failures', async ({ assert }) => {
    const { service, composio } = createService()
    composio.connectedAccounts.list.onFirstCall().rejects(new Error('Composio unavailable'))

    let caughtError: unknown

    try {
      await service.disconnectForWorkspace('user-1', 'workspace-1', 'ca_owned')
    } catch (error) {
      caughtError = error
    }

    assert.instanceOf(caughtError, Error)
    assert.equal((caughtError as Error).message, 'Composio unavailable')
    assert.equal(composio.connectedAccounts.list.callCount, 1)
    assert.isTrue(composio.connectedAccounts.delete.notCalled)
  })

  test('rejects disconnect when connected account is not in workspace identity', async ({ assert }) => {
    const { service, composio } = createService()
    composio.connectedAccounts.list.resolves({
      items: [{ id: 'ca_other' }],
      nextCursor: undefined,
    })

    let caughtError: unknown

    try {
      await service.disconnectForWorkspace('user-1', 'workspace-1', 'ca_missing')
    } catch (error) {
      caughtError = error
    }

    assert.instanceOf(caughtError, ConnectionNotInWorkspaceError)
    assert.isTrue(composio.connectedAccounts.delete.notCalled)
  })
})
