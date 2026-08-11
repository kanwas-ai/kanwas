import { test } from '@japa/runner'
import User from '#models/user'
import Workspace from '#models/workspace'
import OrganizationMembership from '#models/organization_membership'
import DocumentShare from '#models/document_share'
import env from '#start/env'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { loadWorkspaceYDoc, saveWorkspaceYDoc } from '#tests/helpers/workspace_yjs'
import { createWorkspaceContentStore } from 'shared'
import { buildDocumentSharePath, buildWorkspaceRootPath } from 'shared/document-share'

async function login(client: any, user: User): Promise<string> {
  const response = await client.post('/auth/login').json({
    email: user.email,
    password: 'password123',
  })

  response.assertStatus(200)
  return response.body().value
}

function getFirstBlockNoteNote(workspace: Workspace) {
  const { proxy, cleanup } = loadWorkspaceYDoc(workspace)
  const note = proxy.root.items.find((item) => item.kind === 'node' && item.xynode.type === 'blockNote')
  cleanup()

  if (!note || note.kind !== 'node') {
    throw new Error(`Workspace ${workspace.id} does not have a BlockNote note`)
  }

  return note
}

test.group('Document share APIs', () => {
  test('creates, updates, disables, and rotates note shares', async ({ client, assert }) => {
    const user = await User.create({ email: 'document-share-owner@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Document Share Workspace')
    const note = getFirstBlockNoteNote(workspace)
    const initialShareName = note.name
    const token = await login(client, user)

    const initialResponse = await client.get(`/workspaces/${workspace.id}/notes/${note.id}/share`).bearerToken(token)

    initialResponse.assertStatus(200)
    assert.equal(initialResponse.body().active, false)
    assert.isNull(initialResponse.body().share)
    assert.equal(initialResponse.body().workspaceRedirectPath, buildWorkspaceRootPath(workspace.id))

    const createResponse = await client
      .post(`/workspaces/${workspace.id}/notes/${note.id}/share`)
      .bearerToken(token)
      .json({ name: initialShareName, accessMode: 'readonly' })

    createResponse.assertStatus(200)
    assert.equal(createResponse.body().active, true)
    assert.equal(createResponse.body().share.name, initialShareName)
    assert.equal(createResponse.body().share.accessMode, 'readonly')
    assert.equal(createResponse.body().share.publicPath, buildDocumentSharePath(createResponse.body().share.longHashId))

    const firstShareId = createResponse.body().share.id as string
    const firstLongHashId = createResponse.body().share.longHashId as string
    const updatedShareName = 'Renamed shared doc'

    const updateResponse = await client
      .patch(`/workspaces/${workspace.id}/notes/${note.id}/share`)
      .bearerToken(token)
      .json({ name: updatedShareName, accessMode: 'editable' })

    updateResponse.assertStatus(200)
    assert.equal(updateResponse.body().share.id, firstShareId)
    assert.equal(updateResponse.body().share.longHashId, firstLongHashId)
    assert.equal(updateResponse.body().share.name, updatedShareName)
    assert.equal(updateResponse.body().share.accessMode, 'editable')

    const disableResponse = await client.delete(`/workspaces/${workspace.id}/notes/${note.id}/share`).bearerToken(token)

    disableResponse.assertStatus(200)
    assert.equal(disableResponse.body().active, false)
    assert.isNull(disableResponse.body().share)

    const reenableResponse = await client
      .post(`/workspaces/${workspace.id}/notes/${note.id}/share`)
      .bearerToken(token)
      .json({ name: initialShareName, accessMode: 'readonly' })

    reenableResponse.assertStatus(200)
    assert.equal(reenableResponse.body().active, true)
    assert.notEqual(reenableResponse.body().share.id, firstShareId)
    assert.notEqual(reenableResponse.body().share.longHashId, firstLongHashId)
    assert.equal(reenableResponse.body().share.name, initialShareName)

    const shares = await DocumentShare.query()
      .where('workspace_id', workspace.id)
      .where('note_id', note.id)
      .orderBy('created_at', 'asc')

    assert.lengthOf(shares, 2)
    assert.exists(shares[0].revokedAt)
    assert.isNull(shares[1].revokedAt)
    assert.equal(shares[0].name, updatedShareName)
    assert.equal(shares[0].accessMode, 'editable')
    assert.equal(shares[1].name, initialShareName)
    assert.equal(shares[1].accessMode, 'readonly')
  })

  test('allows organization members to manage note shares', async ({ client, assert }) => {
    const admin = await User.create({ email: 'document-share-admin@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(admin, 'Document Share Permissions Workspace')

    const member = await User.create({ email: 'document-share-member@example.com', password: 'password123' })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const note = getFirstBlockNoteNote(workspace)
    const token = await login(client, member)

    const response = await client
      .post(`/workspaces/${workspace.id}/notes/${note.id}/share`)
      .bearerToken(token)
      .json({ name: 'Member-managed share', accessMode: 'editable' })

    response.assertStatus(200)
    assert.equal(response.body().share.createdByUserId, member.id)
    assert.equal(response.body().share.name, 'Member-managed share')
    assert.equal(response.body().share.accessMode, 'editable')
  })

  test('lists active workspace shares without checking live note existence', async ({ client, assert }) => {
    const user = await User.create({ email: 'document-share-list@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Document Share List Workspace')
    const note = getFirstBlockNoteNote(workspace)
    const token = await login(client, user)

    const createResponse = await client
      .post(`/workspaces/${workspace.id}/notes/${note.id}/share`)
      .bearerToken(token)
      .json({ name: 'Listed share', accessMode: 'editable' })

    createResponse.assertStatus(200)
    const shareId = createResponse.body().share.id as string

    const listResponse = await client.get(`/workspaces/${workspace.id}/document-shares`).bearerToken(token)

    listResponse.assertStatus(200)
    assert.equal(listResponse.body().workspaceId, workspace.id)
    assert.lengthOf(listResponse.body().shares, 1)
    assert.equal(listResponse.body().shares[0].noteId, note.id)
    assert.equal(listResponse.body().shares[0].name, 'Listed share')
    assert.equal(listResponse.body().shares[0].accessMode, 'editable')

    const { proxy, yDoc, cleanup } = loadWorkspaceYDoc(workspace)
    try {
      const noteIndex = proxy.root.items.findIndex((item) => item.kind === 'node' && item.id === note.id)
      assert.isAtLeast(noteIndex, 0)
      proxy.root.items.splice(noteIndex, 1)
      createWorkspaceContentStore(yDoc).deleteNoteDoc(note.id)
      await saveWorkspaceYDoc(workspace, yDoc)
    } finally {
      cleanup()
    }

    const staleListResponse = await client.get(`/workspaces/${workspace.id}/document-shares`).bearerToken(token)

    staleListResponse.assertStatus(200)
    assert.equal(staleListResponse.body().workspaceId, workspace.id)
    assert.lengthOf(staleListResponse.body().shares, 1)
    assert.equal(staleListResponse.body().shares[0].id, shareId)
    assert.equal(staleListResponse.body().shares[0].noteId, note.id)

    const share = await DocumentShare.findOrFail(shareId)
    assert.isNull(share.revokedAt)
  })

  test('returns owner share state even when the note disappears', async ({ client, assert }) => {
    const user = await User.create({ email: 'document-share-missing-note@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Document Share Missing Note Workspace')
    const note = getFirstBlockNoteNote(workspace)
    const token = await login(client, user)

    const createResponse = await client
      .post(`/workspaces/${workspace.id}/notes/${note.id}/share`)
      .bearerToken(token)
      .json({ name: 'Missing note share', accessMode: 'readonly' })

    createResponse.assertStatus(200)
    const shareId = createResponse.body().share.id as string

    const { proxy, yDoc, cleanup } = loadWorkspaceYDoc(workspace)
    try {
      const noteIndex = proxy.root.items.findIndex((item) => item.kind === 'node' && item.id === note.id)
      assert.isAtLeast(noteIndex, 0)
      proxy.root.items.splice(noteIndex, 1)
      createWorkspaceContentStore(yDoc).deleteNoteDoc(note.id)
      await saveWorkspaceYDoc(workspace, yDoc)
    } finally {
      cleanup()
    }

    const response = await client.get(`/workspaces/${workspace.id}/notes/${note.id}/share`).bearerToken(token)

    response.assertStatus(200)
    assert.equal(response.body().workspaceId, workspace.id)
    assert.equal(response.body().noteId, note.id)
    assert.equal(response.body().active, true)
    assert.equal(response.body().share.id, shareId)

    const share = await DocumentShare.findOrFail(shareId)
    assert.isNull(share.revokedAt)
  })

  test('resolves public shares and returns revoked or missing states', async ({ client, assert }) => {
    const user = await User.create({ email: 'document-share-public@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Document Share Public Workspace')
    const note = getFirstBlockNoteNote(workspace)
    const shareName = 'Publicly named share'
    const token = await login(client, user)

    const createResponse = await client
      .post(`/workspaces/${workspace.id}/notes/${note.id}/share`)
      .bearerToken(token)
      .json({ name: shareName, accessMode: 'editable' })

    createResponse.assertStatus(200)
    const longHashId = createResponse.body().share.longHashId as string

    const activeResponse = await client.get(`/shares/${longHashId}`)
    activeResponse.assertStatus(200)
    assert.equal(activeResponse.body().status, 'active')
    assert.equal(activeResponse.body().name, shareName)
    assert.equal(activeResponse.body().accessMode, 'editable')
    assert.equal(activeResponse.body().workspaceRedirectPath, buildWorkspaceRootPath(workspace.id))

    const disableResponse = await client.delete(`/workspaces/${workspace.id}/notes/${note.id}/share`).bearerToken(token)

    disableResponse.assertStatus(200)

    const revokedResponse = await client.get(`/shares/${longHashId}`)
    revokedResponse.assertStatus(410)
    assert.equal(revokedResponse.body().status, 'revoked')
    assert.equal(revokedResponse.body().workspaceId, workspace.id)
    assert.equal(revokedResponse.body().noteId, note.id)
    assert.equal(revokedResponse.body().name, shareName)

    const missingResponse = await client.get('/shares/missing-share-hash-1234567890')
    missingResponse.assertStatus(404)
    assert.equal(missingResponse.body().status, 'not_found')
  })

  test('resolves socket access for active shares through the API key route', async ({ client, assert }) => {
    const user = await User.create({ email: 'document-share-socket-access@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Document Share Socket Access Workspace')
    const note = getFirstBlockNoteNote(workspace)
    const token = await login(client, user)

    const createResponse = await client
      .post(`/workspaces/${workspace.id}/notes/${note.id}/share`)
      .bearerToken(token)
      .json({ name: 'Socket access share', accessMode: 'editable' })

    createResponse.assertStatus(200)
    const longHashId = createResponse.body().share.longHashId as string

    const response = await client.get(`/shares/${longHashId}/socket-access`).bearerToken(env.get('API_SECRET'))

    response.assertStatus(200)
    assert.equal(response.body().status, 'active')
    assert.equal(response.body().workspaceId, workspace.id)
    assert.equal(response.body().noteId, note.id)
    assert.equal(response.body().accessMode, 'editable')
  })

  test('resolves socket access shares without checking live note existence', async ({ client, assert }) => {
    const user = await User.create({ email: 'document-share-socket-missing-note@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Document Share Missing Note Socket Workspace')
    const note = getFirstBlockNoteNote(workspace)
    const token = await login(client, user)

    const createResponse = await client
      .post(`/workspaces/${workspace.id}/notes/${note.id}/share`)
      .bearerToken(token)
      .json({ name: 'Socket missing note share', accessMode: 'readonly' })

    createResponse.assertStatus(200)
    const shareId = createResponse.body().share.id as string
    const longHashId = createResponse.body().share.longHashId as string

    const { proxy, yDoc, cleanup } = loadWorkspaceYDoc(workspace)
    try {
      const noteIndex = proxy.root.items.findIndex((item) => item.kind === 'node' && item.id === note.id)
      assert.isAtLeast(noteIndex, 0)
      proxy.root.items.splice(noteIndex, 1)
      createWorkspaceContentStore(yDoc).deleteNoteDoc(note.id)
      await saveWorkspaceYDoc(workspace, yDoc)
    } finally {
      cleanup()
    }

    const response = await client.get(`/shares/${longHashId}/socket-access`).bearerToken(env.get('API_SECRET'))

    response.assertStatus(200)
    assert.equal(response.body().status, 'active')
    assert.equal(response.body().workspaceId, workspace.id)
    assert.equal(response.body().noteId, note.id)

    const share = await DocumentShare.findOrFail(shareId)
    assert.isNull(share.revokedAt)
  })

  test('lazily revokes active public shares when the workspace is deleted', async ({ client, assert }) => {
    const user = await User.create({ email: 'document-share-missing-workspace@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Document Share Missing Workspace')
    const note = getFirstBlockNoteNote(workspace)
    const token = await login(client, user)

    const createResponse = await client
      .post(`/workspaces/${workspace.id}/notes/${note.id}/share`)
      .bearerToken(token)
      .json({ name: 'Workspace tombstone share', accessMode: 'readonly' })

    createResponse.assertStatus(200)
    const shareId = createResponse.body().share.id as string
    const longHashId = createResponse.body().share.longHashId as string

    await Workspace.query().where('id', workspace.id).delete()

    const response = await client.get(`/shares/${longHashId}`)
    response.assertStatus(410)
    assert.equal(response.body().status, 'revoked')
    assert.equal(response.body().workspaceId, workspace.id)
    assert.equal(response.body().name, 'Workspace tombstone share')

    const share = await DocumentShare.findOrFail(shareId)
    assert.exists(share.revokedAt)
  })
})
