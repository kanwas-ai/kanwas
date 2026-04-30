interface DocumentBadgeProps {
  name: string
  maxWidth?: string
}

export function DocumentBadge({ name, maxWidth = 'max-w-[200px]' }: DocumentBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 bg-block-highlight/90 rounded-full text-xs font-medium text-foreground truncate ${maxWidth}`}
      title={name}
    >
      {name}
    </span>
  )
}
