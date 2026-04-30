import { test } from '@japa/runner'
import User from '#models/user'

test.group('Auth profile', () => {
  test('returns and updates the authenticated user profile name', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)

    const user = await User.create({
      email: `profile-user-${suffix}@example.com`,
      name: 'Profile User',
      password: 'password123',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })
    loginResponse.assertStatus(200)

    const meResponse = await client.get('/auth/me').bearerToken(loginResponse.body().value)
    meResponse.assertStatus(200)
    assert.equal(meResponse.body().name, 'Profile User')

    const updateResponse = await client
      .patch('/auth/me')
      .bearerToken(loginResponse.body().value)
      .json({ name: '  Updated Profile Name  ' })

    updateResponse.assertStatus(200)
    assert.equal(updateResponse.body().name, 'Updated Profile Name')

    await user.refresh()
    assert.equal(user.name, 'Updated Profile Name')
  })

  test('rejects invalid profile names', async ({ client }) => {
    const suffix = Date.now().toString(36)

    const user = await User.create({
      email: `profile-invalid-${suffix}@example.com`,
      name: 'Valid Name',
      password: 'password123',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })
    loginResponse.assertStatus(200)

    const invalidResponse = await client
      .patch('/auth/me')
      .bearerToken(loginResponse.body().value)
      .json({ name: String.fromCharCode(1, 2) })

    invalidResponse.assertStatus(422)
  })
})
