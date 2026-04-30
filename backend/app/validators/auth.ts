import vine from '@vinejs/vine'
import './custom_types.js'
import { personNameValidator } from '#validators/person_name'

export const registerValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string().minLength(8),
    name: personNameValidator().optional(),
    inviteToken: vine.string().trim().minLength(1).optional(),
  })
)

export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
    inviteToken: vine.string().trim().minLength(1).optional(),
  })
)

export const googleAuthUrlValidator = vine.compile(
  vine.object({
    inviteToken: vine.string().trim().minLength(1).optional(),
  })
)

export const googleCallbackValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(1),
    state: vine.string().trim().minLength(1),
  })
)

export const updateProfileValidator = vine.compile(
  vine.object({
    name: personNameValidator(),
  })
)

export const UserSchema = vine.compile(
  vine.object({
    id: vine.string(),
    email: vine.string().email(),
    name: vine.string(),
    createdAt: vine.luxonDateTime(),
    updatedAt: vine.luxonDateTime().nullable(),
  })
)
