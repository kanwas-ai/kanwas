export function buildComposioUserIdentity(userId: string, workspaceId: string): string {
  return `u_${userId}_w_${workspaceId}`
}
