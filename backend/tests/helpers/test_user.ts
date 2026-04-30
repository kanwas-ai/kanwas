import User from '#models/user'
import { nanoid } from 'nanoid'

/**
 * Create a test user with a unique email
 */
export async function createTestUser(): Promise<User> {
  return await User.create({
    email: `test-${nanoid(8)}@example.com`,
    password: 'password123',
  })
}

/**
 * Clean up a test user
 */
export async function cleanupTestUser(user: User): Promise<void> {
  await user.delete()
}
