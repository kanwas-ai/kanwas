import { LOCAL_USER } from 'shared/local-api'

export interface UserIdentity {
  id: string
  name: string
  color: string
}

/** Single-instance desktop identity used for collaboration presence and audit metadata. */
export const LOCAL_USER_IDENTITY: UserIdentity = {
  ...LOCAL_USER,
  color: '#e8a300',
}
