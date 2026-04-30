import { test } from '@japa/runner'
import User from '#models/user'
import OrganizationMembership from '#models/organization_membership'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { createFakeImageBuffer } from '#tests/helpers/test_image'
import path from 'node:path'
import fs from 'node:fs'

test.group('Files - upload', () => {
  test('uploads file with valid data and returns correct response', async ({ client, assert }) => {
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

    // Create a temporary test file
    const testFilePath = path.join('/tmp', 'test-upload.png')
    const pngBuffer = createFakeImageBuffer()
    fs.writeFileSync(testFilePath, pngBuffer)

    try {
      const response = await client
        .post(`/workspaces/${workspace.id}/files`)
        .bearerToken(token)
        .file('file', testFilePath)
        .fields({
          canvas_id: 'canvas-123',
          filename: 'test-image.png',
        })

      response.assertStatus(200)

      const body = response.body()
      assert.equal(body.storagePath, `files/${workspace.id}/canvas-123/test-image.png`)
      assert.equal(body.mimeType, 'image/png')
      assert.equal(body.filename, 'test-image.png')
      assert.isNumber(body.size)
      assert.isAbove(body.size, 0)
    } finally {
      // Cleanup
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath)
      }
    }
  })

  test('allows organization members to upload files', async ({ client, assert }) => {
    const owner = await User.create({
      email: 'owner@example.com',
      password: 'password123',
    })

    const member = await User.create({
      email: 'member@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(owner, 'Test Workspace')

    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'member@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    const testFilePath = path.join('/tmp', 'test-upload-member.png')
    const pngBuffer = createFakeImageBuffer()
    fs.writeFileSync(testFilePath, pngBuffer)

    try {
      const response = await client
        .post(`/workspaces/${workspace.id}/files`)
        .bearerToken(token)
        .file('file', testFilePath)
        .fields({
          canvas_id: 'canvas-123',
          filename: 'member-image.png',
        })

      response.assertStatus(200)

      const body = response.body()
      assert.equal(body.storagePath, `files/${workspace.id}/canvas-123/member-image.png`)
      assert.equal(body.mimeType, 'image/png')
      assert.equal(body.filename, 'member-image.png')
    } finally {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath)
      }
    }
  })

  test('returns 401 when user is not workspace member', async ({ client }) => {
    const owner = await User.create({
      email: 'owner@example.com',
      password: 'password123',
    })

    await User.create({
      email: 'nonowner@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(owner, 'Test Workspace')

    // Login as non-owner
    const loginResponse = await client.post('/auth/login').json({
      email: 'nonowner@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    const testFilePath = path.join('/tmp', 'test-upload-401.png')
    const pngBuffer = createFakeImageBuffer()
    fs.writeFileSync(testFilePath, pngBuffer)

    try {
      const response = await client
        .post(`/workspaces/${workspace.id}/files`)
        .bearerToken(token)
        .file('file', testFilePath)
        .fields({
          canvas_id: 'canvas-123',
          filename: 'test-image.png',
        })

      response.assertStatus(401)
      response.assertBodyContains({ error: 'Unauthorized' })
    } finally {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath)
      }
    }
  })

  test('returns 404 when workspace does not exist', async ({ client }) => {
    await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    const testFilePath = path.join('/tmp', 'test-upload-404.png')
    const pngBuffer = createFakeImageBuffer()
    fs.writeFileSync(testFilePath, pngBuffer)

    try {
      const response = await client
        .post('/workspaces/00000000-0000-0000-0000-000000000000/files')
        .bearerToken(token)
        .file('file', testFilePath)
        .fields({
          canvas_id: 'canvas-123',
          filename: 'test-image.png',
        })

      response.assertStatus(404)
    } finally {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath)
      }
    }
  })

  test('returns 422 when file is missing', async ({ client }) => {
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

    const response = await client.post(`/workspaces/${workspace.id}/files`).bearerToken(token).fields({
      canvas_id: 'canvas-123',
      filename: 'test-image.png',
    })

    response.assertStatus(422)
  })

  test('returns 422 when canvas_id is missing', async ({ client }) => {
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

    const testFilePath = path.join('/tmp', 'test-upload-no-canvas.png')
    const pngBuffer = createFakeImageBuffer()
    fs.writeFileSync(testFilePath, pngBuffer)

    try {
      const response = await client
        .post(`/workspaces/${workspace.id}/files`)
        .bearerToken(token)
        .file('file', testFilePath)
        .fields({
          filename: 'test-image.png',
        })

      response.assertStatus(422)
    } finally {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath)
      }
    }
  })

  test('returns 422 when filename is missing', async ({ client }) => {
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

    const testFilePath = path.join('/tmp', 'test-upload-no-filename.png')
    const pngBuffer = createFakeImageBuffer()
    fs.writeFileSync(testFilePath, pngBuffer)

    try {
      const response = await client
        .post(`/workspaces/${workspace.id}/files`)
        .bearerToken(token)
        .file('file', testFilePath)
        .fields({
          canvas_id: 'canvas-123',
        })

      response.assertStatus(422)
    } finally {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath)
      }
    }
  })

  test('returns 422 when file has unsupported extension', async ({ client }) => {
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

    const testFilePath = path.join('/tmp', 'test-upload.exe')
    fs.writeFileSync(testFilePath, 'fake executable content')

    try {
      const response = await client
        .post(`/workspaces/${workspace.id}/files`)
        .bearerToken(token)
        .file('file', testFilePath)
        .fields({
          canvas_id: 'canvas-123',
          filename: 'malware.exe',
        })

      response.assertStatus(422)
    } finally {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath)
      }
    }
  })
})
