import { test } from '@japa/runner'
import User from '#models/user'

test.group('Auth login', () => {
  test('should login with valid credentials and return token', async ({ client, assert }) => {
    await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const response = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    response.assertStatus(200)
    response.assertBodyContains({
      type: 'bearer',
    })
    assert.exists(response.body().value)
    assert.isString(response.body().value)
  })

  test('should fail with invalid email', async ({ client }) => {
    await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const response = await client.post('/auth/login').json({
      email: 'wrong@example.com',
      password: 'password123',
    })

    response.assertStatus(400)
  })

  test('should fail with invalid password', async ({ client }) => {
    await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const response = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'wrongpassword',
    })

    response.assertStatus(400)
  })

  test('should fail with missing credentials', async ({ client }) => {
    const response = await client.post('/auth/login').json({})

    response.assertStatus(422)
  })
})
