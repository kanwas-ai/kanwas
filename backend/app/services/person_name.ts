import { createHash } from 'node:crypto'

export const PERSON_NAME_MIN_LENGTH = 2
export const PERSON_NAME_MAX_LENGTH = 80
export const PERSON_NAME_HAS_NON_CONTROL_CHAR_REGEX = /[\P{C}]/u

const ADJECTIVES = [
  'Amber',
  'Brisk',
  'Calm',
  'Clever',
  'Daring',
  'Eager',
  'Fabled',
  'Gentle',
  'Golden',
  'Harbor',
  'Ivy',
  'Jade',
  'Kind',
  'Lively',
  'Merry',
  'Nimble',
  'Opal',
  'Pacific',
  'Quiet',
  'Radiant',
  'Silver',
  'Sunny',
  'Tidy',
  'Umber',
  'Velvet',
  'Warm',
  'Young',
  'Zephyr',
] as const

const NOUNS = [
  'Badger',
  'Beacon',
  'Birch',
  'Brook',
  'Comet',
  'Falcon',
  'Forest',
  'Glade',
  'Harbor',
  'Heron',
  'Juniper',
  'Lagoon',
  'Lantern',
  'Maple',
  'Meadow',
  'Orchid',
  'Otter',
  'Pioneer',
  'Quartz',
  'Raven',
  'River',
  'Sparrow',
  'Summit',
  'Timber',
  'Trail',
  'Willow',
  'Wren',
] as const

export function normalizePersonName(value: string): string {
  return value.trim()
}

export function isValidPersonName(value: string): boolean {
  const normalized = normalizePersonName(value)

  if (normalized.length < PERSON_NAME_MIN_LENGTH || normalized.length > PERSON_NAME_MAX_LENGTH) {
    return false
  }

  return PERSON_NAME_HAS_NON_CONTROL_CHAR_REGEX.test(normalized)
}

export function generateSeededPersonName(seed: string): string {
  const normalizedSeed = normalizeSeed(seed)
  const adjective = pickSeededEntry(ADJECTIVES, normalizedSeed, 'adjective')
  const noun = pickSeededEntry(NOUNS, normalizedSeed, 'noun')
  const suffixNumber = 100 + (seededUInt32(normalizedSeed, 'suffix') % 900)
  const generated = `${adjective} ${noun} ${suffixNumber}`

  if (!isValidPersonName(generated)) {
    throw new Error('Generated person name is invalid')
  }

  return generated
}

function normalizeSeed(seed: string): string {
  const normalized = seed.trim().toLowerCase()
  return normalized.length > 0 ? normalized : 'anonymous-user'
}

function pickSeededEntry<const T extends readonly string[]>(entries: T, seed: string, salt: string): T[number] {
  return entries[seededUInt32(seed, salt) % entries.length]
}

function seededUInt32(seed: string, salt: string): number {
  const digest = createHash('sha256').update(`${salt}:${seed}`).digest()
  return digest.readUInt32BE(0)
}
