import type { HTMLAttributes, ReactNode } from 'react'

type ComparisonCardVariant = 'negative' | 'positive'

interface ComparisonCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  children: ReactNode
  variant: ComparisonCardVariant
  className?: string
}

const variantClassName: Record<ComparisonCardVariant, string> = {
  negative: 'bg-[image:var(--gradient-comparison-negative)]',
  positive: 'bg-[image:var(--gradient-comparison-positive)]',
}

export function ComparisonCard({ children, variant, className, ...props }: ComparisonCardProps) {
  return (
    <div
      className={[
        'relative min-h-[230px] rounded-[15.387px] border-2 border-[var(--color-surface-white)]',
        'p-[20.516px] main-page-font-ui text-[24px] font-medium leading-[36px]',
        '[box-shadow:0_15px_50px_0_var(--color-shadow-comparison-card)] text-[var(--color-text-neutral-new)]',
        variantClassName[variant],
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
