import type { HTMLAttributes, ReactNode } from 'react'

interface ArticleChipProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  children: ReactNode
  className?: string
}

export function ArticleChip({ children, className, ...props }: ArticleChipProps) {
  return (
    <div
      className={[
        'inline-flex items-center justify-center rounded-[40px] border border-[var(--color-border-muted-new)]',
        'bg-[var(--color-surface-chip)] px-[12px] py-[8px] main-page-font-ui text-[14px]',
        'font-semibold leading-none text-[var(--color-text-primary)] shadow-[var(--shadow-chip-inner-glow)]',
        'whitespace-nowrap',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
