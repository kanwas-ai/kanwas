import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  postInitiate: vi.fn(),
  tuyauWorkspaces: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  tuyau: {
    workspaces: (...args: unknown[]) => mocks.tuyauWorkspaces(...args),
  },
}))

import { initiateConnection, InitiateConnectionError } from '@/api/connections'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tuyauWorkspaces.mockReturnValue({
    connections: {
      initiate: {
        $post: mocks.postInitiate,
      },
    },
  })
})

describe('connections api initiateConnection', () => {
  it('decodes managed-auth success responses', async () => {
    mocks.postInitiate.mockResolvedValue({
      data: {
        status: 'OK',
        redirectUrl: 'https://composio.example.com/link',
        connectedAccountId: 'ca_123',
      },
    })

    const result = await initiateConnection('workspace-1', {
      toolkit: 'github',
      callbackUrl: 'https://app.kanwas.ai/connections/callback',
    })

    expect(result).toEqual({
      status: 'OK',
      redirectUrl: 'https://composio.example.com/link',
      connectedAccountId: 'ca_123',
    })
    expect(mocks.postInitiate).toHaveBeenCalledWith({
      toolkit: 'github',
      callbackUrl: 'https://app.kanwas.ai/connections/callback',
      customAuth: undefined,
    })
  })

  it('decodes custom auth required responses', async () => {
    const requirements = {
      toolkit: 'posthog',
      displayName: 'PostHog',
      composioManagedAuthSchemes: ['API_KEY'],
      authModes: [
        {
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
                description: '',
              },
            ],
            optional: [],
          },
          connectedAccountInitiation: {
            required: [],
            optional: [],
          },
        },
      ],
    }

    mocks.postInitiate.mockResolvedValue({
      data: {
        status: 'CUSTOM_AUTH_REQUIRED',
        requirements,
      },
    })

    const result = await initiateConnection('workspace-1', {
      toolkit: 'posthog',
      callbackUrl: 'https://app.kanwas.ai/connections/callback',
    })

    expect(result).toEqual({
      status: 'CUSTOM_AUTH_REQUIRED',
      requirements,
    })
  })

  it('surfaces api error code and message when request fails', async () => {
    mocks.postInitiate.mockResolvedValue({
      error: {
        value: {
          code: 'INVALID_CALLBACK_URL',
          error: 'Callback URL origin is not allowed',
        },
      },
    })

    await expect(
      initiateConnection('workspace-1', {
        toolkit: 'github',
        callbackUrl: 'https://evil.example.com/connections/callback',
      })
    ).rejects.toMatchObject({
      name: 'InitiateConnectionError',
      code: 'INVALID_CALLBACK_URL',
      message: 'Callback URL origin is not allowed',
    })
  })

  it('throws INITIATE_FAILED when response is incomplete', async () => {
    mocks.postInitiate.mockResolvedValue({
      data: {
        status: 'OK',
      },
    })

    let caughtError: unknown

    try {
      await initiateConnection('workspace-1', {
        toolkit: 'github',
        callbackUrl: 'https://app.kanwas.ai/connections/callback',
      })
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(InitiateConnectionError)
    expect((caughtError as InitiateConnectionError).code).toBe('INITIATE_FAILED')
    expect((caughtError as Error).message).toBe('Connection response was incomplete')
  })
})
