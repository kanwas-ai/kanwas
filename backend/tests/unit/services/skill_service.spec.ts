import { test } from '@japa/runner'
import SkillService from '#services/skill_service'
import Skill from '#models/skill'
import SkillPreference from '#models/skill_preference'
import User from '#models/user'
import { createTestUser, cleanupTestUser } from '../../helpers/test_user.js'

test.group('SkillService', (group) => {
  let testUser: User

  group.each.setup(async () => {
    testUser = await createTestUser()
  })

  group.each.teardown(async () => {
    // Clean up skills and preferences
    await SkillPreference.query().where('user_id', testUser.id).delete()
    await Skill.query().where('user_id', testUser.id).delete()
    await cleanupTestUser(testUser)
  })

  test('listEnabledSkills returns empty array when no skills', async ({ assert }) => {
    const service = new SkillService()
    const result = await service.listEnabledSkills(testUser.id)
    assert.deepEqual(result, [])
  })

  test('listEnabledSkills returns system skills by default', async ({ assert }) => {
    // Create a system skill (description is stored in metadata)
    await Skill.create({
      name: 'system-skill',
      body: 'System skill body',
      metadata: { description: 'A system skill' },
      isSystem: true,
      userId: null,
    })

    const service = new SkillService()
    const result = await service.listEnabledSkills(testUser.id)

    assert.lengthOf(result, 1)
    assert.equal(result[0].name, 'system-skill')
    assert.equal(result[0].description, 'A system skill')

    // Cleanup
    await Skill.query().where('name', 'system-skill').delete()
  })

  test('listEnabledSkills excludes disabled system skills', async ({ assert }) => {
    // Create a system skill
    const skill = await Skill.create({
      name: 'disabled-system-skill',
      body: 'Body',
      metadata: { description: 'A disabled system skill' },
      isSystem: true,
      userId: null,
    })

    // Disable it for this user
    await SkillPreference.create({
      userId: testUser.id,
      skillId: skill.id,
      enabled: false,
    })

    const service = new SkillService()
    const result = await service.listEnabledSkills(testUser.id)

    assert.deepEqual(result, [])

    // Cleanup
    await SkillPreference.query().where('skill_id', skill.id).delete()
    await skill.delete()
  })

  test('listEnabledSkills returns user skills', async ({ assert }) => {
    // Create a user skill
    await Skill.create({
      name: 'user-skill',
      body: 'User skill body',
      metadata: { description: 'A user skill' },
      isSystem: false,
      userId: testUser.id,
    })

    const service = new SkillService()
    const result = await service.listEnabledSkills(testUser.id)

    assert.lengthOf(result, 1)
    assert.equal(result[0].name, 'user-skill')
  })

  test('getSkill returns null for non-existent skill', async ({ assert }) => {
    const service = new SkillService()
    const result = await service.getSkill(testUser.id, 'non-existent')
    assert.isNull(result)
  })

  test('getSkill returns skill when enabled', async ({ assert }) => {
    // Create a user skill
    const skill = await Skill.create({
      name: 'my-skill',
      body: 'Skill body',
      metadata: { description: 'My skill', custom: 'value' },
      isSystem: false,
      userId: testUser.id,
    })

    const service = new SkillService()
    const result = await service.getSkill(testUser.id, 'my-skill')

    assert.isNotNull(result)
    assert.equal(result!.id, skill.id)
    assert.equal(result!.name, 'my-skill')
    assert.equal(result!.description, 'My skill')
    assert.equal(result!.body, 'Skill body')
    assert.deepEqual(result!.metadata, { description: 'My skill', custom: 'value' })
    assert.isFalse(result!.isSystem)
  })

  test('getSkill returns null for disabled skill', async ({ assert }) => {
    // Create a skill and disable it
    const skill = await Skill.create({
      name: 'disabled-skill',
      body: 'Body',
      metadata: { description: 'Disabled skill' },
      isSystem: false,
      userId: testUser.id,
    })

    await SkillPreference.create({
      userId: testUser.id,
      skillId: skill.id,
      enabled: false,
    })

    const service = new SkillService()
    const result = await service.getSkill(testUser.id, 'disabled-skill')

    assert.isNull(result)
  })

  test('importSkill creates new skill from SKILL.md content', async ({ assert }) => {
    const service = new SkillService()
    const content = `---
name: imported-skill
description: An imported skill.
---

# Imported

Body content.
`

    const result = await service.importSkill(testUser.id, content)

    assert.isTrue(result.success)
    if (result.success) {
      assert.equal(result.name, 'imported-skill')
      assert.exists(result.skillId)
    }

    // Verify skill was created
    const skill = await Skill.findBy('name', 'imported-skill')
    assert.isNotNull(skill)
    assert.equal(skill!.userId, testUser.id)
    assert.isFalse(skill!.isSystem)
  })

  test('importSkill updates existing user skill', async ({ assert }) => {
    // Create existing skill
    const existing = await Skill.create({
      name: 'update-me',
      body: 'Original body',
      metadata: { description: 'Original description' },
      isSystem: false,
      userId: testUser.id,
    })

    const service = new SkillService()
    const content = `---
name: update-me
description: Updated description
---

Updated body.
`

    const result = await service.importSkill(testUser.id, content)

    assert.isTrue(result.success)
    if (result.success) {
      assert.equal(result.skillId, existing.id)
    }

    // Verify skill was updated (description is in metadata)
    await existing.refresh()
    assert.equal(existing.description, 'Updated description')
    assert.include(existing.body, 'Updated body')
  })

  test('importSkill returns error for invalid content', async ({ assert }) => {
    const service = new SkillService()
    const content = 'No frontmatter here'

    const result = await service.importSkill(testUser.id, content)

    assert.isFalse(result.success)
    if (!result.success) {
      assert.exists(result.error)
    }
  })

  test('getSkillToolDescription returns static description', ({ assert }) => {
    const service = new SkillService()
    const result = service.getSkillToolDescription()

    assert.include(result, 'Execute a skill by name')
  })

  test('getSkillDescriptionsForPrompt returns null when no skills enabled', async ({ assert }) => {
    const service = new SkillService()
    const result = await service.getSkillDescriptionsForPrompt(testUser.id)

    assert.isNull(result)
  })

  test('getSkillDescriptionsForPrompt lists enabled skills', async ({ assert }) => {
    // Create skills
    await Skill.create({
      name: 'skill-a',
      body: '',
      metadata: { description: 'Does A things' },
      isSystem: false,
      userId: testUser.id,
    })

    await Skill.create({
      name: 'skill-b',
      body: '',
      metadata: { description: 'Does B things' },
      isSystem: false,
      userId: testUser.id,
    })

    const service = new SkillService()
    const result = await service.getSkillDescriptionsForPrompt(testUser.id)

    assert.isNotNull(result)
    assert.include(result!, 'skill-a')
    assert.include(result!, 'Does A things')
    assert.include(result!, 'skill-b')
    assert.include(result!, 'Does B things')
  })

  test('listEnabledSkills dedupes by name, user skill shadows system skill', async ({ assert }) => {
    // Create a system skill
    await Skill.create({
      name: 'shared-skill',
      body: 'System body',
      metadata: { description: 'System version' },
      isSystem: true,
      userId: null,
    })

    // Create a user skill with the same name
    await Skill.create({
      name: 'shared-skill',
      body: 'User body',
      metadata: { description: 'User version' },
      isSystem: false,
      userId: testUser.id,
    })

    const service = new SkillService()
    const result = await service.listEnabledSkills(testUser.id)

    // Should only return ONE skill with this name (the user version)
    const sharedSkills = result.filter((s) => s.name === 'shared-skill')
    assert.lengthOf(sharedSkills, 1)
    assert.equal(sharedSkills[0].description, 'User version')

    // Cleanup
    await Skill.query().where('name', 'shared-skill').delete()
  })
})
