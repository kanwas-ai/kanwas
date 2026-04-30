type CategoryButtonVariant = 'sidebar' | 'chip'

interface ConnectionsCategoryFilterButtonProps {
  variant: CategoryButtonVariant
  label: string
  count: number
  iconClassName: string
  iconColorClassName: string
  isSelected: boolean
  onClick: () => void
  className?: string
}

function getButtonClassName(
  variant: CategoryButtonVariant,
  isSelected: boolean,
  className: string | undefined
): string {
  const variantClassName =
    variant === 'sidebar'
      ? 'w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer'
      : 'px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors cursor-pointer'

  const stateClassName =
    variant === 'sidebar'
      ? isSelected
        ? 'bg-block-highlight text-foreground font-medium'
        : 'text-foreground-muted hover:bg-block-highlight/60 hover:text-foreground'
      : isSelected
        ? 'bg-block-highlight text-foreground font-medium'
        : 'bg-editor border border-outline text-foreground-muted'

  return [variantClassName, stateClassName, className].filter(Boolean).join(' ')
}

function getCountClassName(variant: CategoryButtonVariant, isSelected: boolean): string {
  const baseClassName =
    variant === 'sidebar'
      ? 'rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums'
      : 'rounded-sm px-1 py-0.5 text-[12px] font-semibold tabular-nums'

  return `${baseClassName} ${isSelected ? 'bg-canvas/80 text-foreground/90' : 'bg-canvas/60 text-foreground-muted/85'}`
}

export function ConnectionsCategoryFilterButton({
  variant,
  label,
  count,
  iconClassName,
  iconColorClassName,
  isSelected,
  onClick,
  className,
}: ConnectionsCategoryFilterButtonProps) {
  const labelClassName =
    variant === 'sidebar'
      ? 'truncate text-[11px] uppercase tracking-[0.08em] font-semibold'
      : 'uppercase tracking-[0.08em] text-[12px] font-semibold'
  const iconSizeClassName = variant === 'sidebar' ? 'text-[11px]' : 'text-[12px]'

  return (
    <button type="button" onClick={onClick} className={getButtonClassName(variant, isSelected, className)}>
      <span className="inline-flex items-center justify-between gap-3 w-full">
        <span className="inline-flex min-w-0 items-center gap-2">
          <i className={`${iconClassName} ${iconColorClassName} ${iconSizeClassName}`} aria-hidden="true" />
          <span className={labelClassName}>{label}</span>
        </span>
        <span className={getCountClassName(variant, isSelected)}>{count}</span>
      </span>
    </button>
  )
}
