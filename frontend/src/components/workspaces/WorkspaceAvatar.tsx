interface WorkspaceAvatarProps {
  name: string
  className?: string
}

// Generate initials from workspace name
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)

  if (words.length >= 2) {
    // First letter of first two words
    return (words[0][0] + words[1][0]).toUpperCase()
  } else if (words.length === 1) {
    // First two letters of single word
    return words[0].slice(0, 2).toUpperCase()
  }

  return 'WS'
}

export function WorkspaceAvatar({ name, className = '' }: WorkspaceAvatarProps) {
  const initials = getInitials(name)

  return (
    <div
      className={`
        w-8 h-8 !text-sm
        rounded-lg flex items-center justify-center
        text-foreground font-semibold
        select-none
        ${className}
      `}
      aria-label={name}
    >
      {initials}
    </div>
  )
}
