import { test } from '@japa/runner'
import { default as AdminWorkspacesController } from 'admin-backend/controllers/workspaces'
import Organization from 'backend/models/organization'
import Workspace from 'backend/models/workspace'

test.group('AdminWorkspacesController', () => {
  test('finds a workspace by compact hex UUID search', async ({ assert }) => {
    const organization = await Organization.create({ name: 'Hex Search Org' })
    const workspace = await Workspace.create({
      name: 'Searchable Workspace',
      organizationId: organization.id,
    })

    const controller = new AdminWorkspacesController({} as any, {} as any)
    const compactHexId = workspace.id.replace(/-/g, '')

    const result = await controller.index({
      request: {
        input: (_key: string, defaultValue: string) => (defaultValue === '' ? compactHexId : defaultValue),
      },
    } as any)

    assert.lengthOf(result, 1)
    assert.equal(result[0].id, workspace.id)
    assert.equal(result[0].organization?.id, organization.id)
  })

  test('keeps workspace and organization name search working', async ({ assert }) => {
    const organization = await Organization.create({ name: 'Search Target Org' })
    const workspace = await Workspace.create({
      name: 'Human Search Name',
      organizationId: organization.id,
    })

    const controller = new AdminWorkspacesController({} as any, {} as any)

    const byWorkspaceName = await controller.index({
      request: {
        input: (_key: string, defaultValue: string) => (defaultValue === '' ? 'Human Search' : defaultValue),
      },
    } as any)

    const byOrganizationName = await controller.index({
      request: {
        input: (_key: string, defaultValue: string) => (defaultValue === '' ? 'Target Org' : defaultValue),
      },
    } as any)

    assert.exists(byWorkspaceName.find((entry: { id: string }) => entry.id === workspace.id))
    assert.exists(byOrganizationName.find((entry: { id: string }) => entry.id === workspace.id))
  })
})
