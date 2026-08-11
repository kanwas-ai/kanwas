import { LOCAL_USER } from 'shared/local-api'

export interface UserIdentity {
  id: string
  name: string
  color: string
}

/** Fixed single-instance desktop identity used for local audit metadata and editor configuration. */
export const LOCAL_USER_IDENTITY: UserIdentity = {
  ...LOCAL_USER,
  color: '#e8a300',
}
