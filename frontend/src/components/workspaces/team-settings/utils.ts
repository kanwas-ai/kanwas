export function getRoleBadgeClasses(role: string): string {
  if (role === 'admin') {
    return 'border-focused-content/35 bg-focused/40 text-focused-content'
  }
  return 'border-outline bg-block-highlight text-foreground-muted'
}

export function formatRoleLabel(role: string): string {
  if (role === 'admin') return 'Admin'
  if (role === 'member') return 'Member'
  return role
}
