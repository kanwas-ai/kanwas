import { test } from '@japa/runner'
import {
  generateSeededPersonName,
  isValidPersonName,
  normalizePersonName,
  PERSON_NAME_MAX_LENGTH,
  PERSON_NAME_MIN_LENGTH,
} from '#services/person_name'

test.group('person name service', () => {
  test('generates deterministic names from stable seeds', async ({ assert }) => {
    const seed = 'deterministic@example.com'
    const first = generateSeededPersonName(seed)
    const second = generateSeededPersonName(seed)

    assert.equal(first, second)
    assert.isTrue(isValidPersonName(first))
  })

  test('normalizes + validates names within envelope', async ({ assert }) => {
    const normalized = normalizePersonName('  Example Person  ')
    assert.equal(normalized, 'Example Person')
    assert.isTrue(isValidPersonName(normalized))
    assert.isFalse(isValidPersonName('a'))
    assert.isFalse(isValidPersonName('x'.repeat(PERSON_NAME_MAX_LENGTH + 1)))
    assert.isFalse(isValidPersonName(String.fromCharCode(1, 2)))
    assert.isTrue(isValidPersonName('x'.repeat(PERSON_NAME_MIN_LENGTH)))
  })
})
