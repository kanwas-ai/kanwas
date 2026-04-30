import { test } from '@japa/runner'
import sinon from 'sinon'
import User from '#models/user'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { LLM } from '#libs/llm'

test.group('POST /workspaces/:id/nodes/:nodeId/summarize', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('summarizes provided markdown content', async ({ client }) => {
    sinon.stub(LLM.prototype, 'complete').resolves({
      title: 'Launch Plan',
      emoji: 'rocket',
      summary: 'Coordinate launch checklist',
    })

    const user = await User.create({ email: 'summary-success@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Summary Workspace')
    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const token = loginResponse.body().value
    const response = await client
      .post(`/workspaces/${workspace.id}/nodes/node-1/summarize`)
      .bearerToken(token)
      .json({
        name: 'Untitled Document',
        content: `# Product launch plan

Rollout milestones, launch owners, and the checklist for next week.`,
        emoji: null,
        summary: null,
      })

    response.assertStatus(200)
    response.assertBody({
      title: 'Launch Plan',
      emoji: 'rocket',
      summary: 'Coordinate launch checklist',
    })
  })

  test('returns defaults when content is too short', async ({ client }) => {
    const user = await User.create({ email: 'summary@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Summary Workspace')

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.post(`/workspaces/${workspace.id}/nodes/node-1/summarize`).bearerToken(token).json({
      name: 'Untitled Document',
      content: 'Too short',
      emoji: null,
      summary: null,
    })

    response.assertStatus(200)
    response.assertBody({
      title: 'Untitled Document',
      emoji: '📝',
      summary: '',
    })
  })
})
