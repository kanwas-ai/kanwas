import { test } from '@japa/runner'
import User from '#models/user'
import drive from '@adonisjs/drive/services/main'
import { createFakeImageBuffer } from '#tests/helpers/test_image'
import { createTestWorkspace } from '#tests/helpers/workspace'

test.group('Files - signed URL', () => {
  test('returns signed URL for valid path', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    // First, put a file in storage so we can get a signed URL for it
    const testPath = `files/${workspace.id}/test-canvas/test-file.png`
    const pngBuffer = createFakeImageBuffer()
    await drive.use().put(testPath, pngBuffer)

    try {
      const response = await client.get('/files/signed-url').bearerToken(token).qs({ path: testPath })

      response.assertStatus(200)

      const body = response.body()
      assert.exists(body.url)
      assert.isString(body.url)
      // The URL should contain the path in some form
      assert.include(body.url, 'test-file.png')
    } finally {
      // Cleanup
      await drive.use().delete(testPath)
    }
  })

  test('returns 400 when path is missing', async ({ client }) => {
    await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    const response = await client.get('/files/signed-url').bearerToken(token)

    response.assertStatus(400)
    response.assertBodyContains({ error: 'Path parameter is required' })
  })

  test('returns signed URL even for non-existent path (URL validity checked on access)', async ({ client, assert }) => {
    // Note: Signed URLs are generated without checking if the file exists.
    // The error only occurs when the URL is accessed, not when generated.
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    const response = await client
      .get('/files/signed-url')
      .bearerToken(token)
      .qs({ path: `files/${workspace.id}/nonexistent/path/file.png` })

    // Signed URL generation succeeds even for non-existent files
    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.url)
    assert.isString(body.url)
  })
})
