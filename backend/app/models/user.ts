import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, column, manyToMany, hasMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { ManyToMany, HasMany } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import OAuthAccount from '#models/o_auth_account'
import Skill from '#models/skill'
import SkillPreference from '#models/skill_preference'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import { generateSeededPersonName, normalizePersonName } from '#services/person_name'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare email: string

  @column()
  declare name: string

  @column({ serializeAs: null })
  declare password: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @manyToMany(() => Workspace, {
    pivotTable: 'workspace_users',
    pivotTimestamps: true,
  })
  declare workspaces: ManyToMany<typeof Workspace>

  @hasMany(() => OAuthAccount)
  declare oauthAccounts: HasMany<typeof OAuthAccount>

  @hasMany(() => Skill)
  declare skills: HasMany<typeof Skill>

  @hasMany(() => SkillPreference)
  declare skillPreferences: HasMany<typeof SkillPreference>

  @hasMany(() => OrganizationMembership)
  declare organizationMemberships: HasMany<typeof OrganizationMembership>

  @manyToMany(() => Organization, {
    pivotTable: 'organization_memberships',
    pivotColumns: ['role'],
    pivotTimestamps: true,
  })
  declare organizations: ManyToMany<typeof Organization>

  @beforeCreate()
  static ensureName(user: User) {
    if (typeof user.name === 'string' && user.name.trim().length > 0) {
      user.name = normalizePersonName(user.name)
      return
    }

    user.name = generateSeededPersonName(user.email)
  }

  static accessTokens = DbAccessTokensProvider.forModel(User)
}
