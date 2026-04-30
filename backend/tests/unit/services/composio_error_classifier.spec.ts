import { test } from '@japa/runner'
import {
  extractComposioErrorDetails,
  isComposioAuthConfigNotFoundError,
  isComposioMissingManagedAuthError,
  isComposioUnsupportedConnectedAccountStatusesError,
} from '#services/composio/error_classifier'

test.group('composio error classifier', () => {
  test('extracts details from nested Composio response payloads', ({ assert }) => {
    const details = extractComposioErrorDetails({
      response: {
        data: {
          error: {
            message: 'Auth config does not exist',
            slug: 'auth_config_not_found',
            status: 404,
          },
        },
      },
    })

    assert.equal(details.message, 'Auth config does not exist')
    assert.equal(details.slug, 'auth_config_not_found')
    assert.equal(details.status, 404)
  })

  test('classifies auth config not found errors', ({ assert }) => {
    const isMatch = isComposioAuthConfigNotFoundError({
      cause: {
        slug: 'auth_config_not_found',
        status: 404,
      },
    })

    assert.isTrue(isMatch)
  })

  test('classifies explicit missing managed auth errors', ({ assert }) => {
    const isMatch = isComposioMissingManagedAuthError({
      code: 'toolkit_requires_custom_auth',
      message: 'Managed auth is not available for this toolkit',
      status: 400,
    })

    assert.isTrue(isMatch)
  })

  test('does not classify unrelated custom auth failures as managed-auth missing', ({ assert }) => {
    const isMatch = isComposioMissingManagedAuthError({
      message: 'Custom auth validation failed because oauth_redirect_uri is malformed',
      status: 400,
      code: 'invalid_request',
    })

    assert.isFalse(isMatch)
  })

  test('classifies unsupported connected account status filter errors', ({ assert }) => {
    const isMatch = isComposioUnsupportedConnectedAccountStatusesError({
      status: 400,
      message: 'Invalid status filter. statuses must be one of ACTIVE only',
      code: 'invalid_status_filter',
    })

    assert.isTrue(isMatch)
  })

  test('does not classify unrelated connected accounts errors as status filter issues', ({ assert }) => {
    const isMatch = isComposioUnsupportedConnectedAccountStatusesError({
      status: 503,
      message: 'Service unavailable while listing connected accounts',
      code: 'upstream_unavailable',
    })

    assert.isFalse(isMatch)
  })
})
