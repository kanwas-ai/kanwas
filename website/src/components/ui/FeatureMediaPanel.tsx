import type { HTMLAttributes, ReactNode } from 'react'

interface FeatureMediaPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  children: ReactNode
  className?: string
}

export function FeatureMediaPanel({ children, className, ...props }: FeatureMediaPanelProps) {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-[24px] border-2 border-[#E2E2E2]',
        'bg-[var(--color-surface-panel-new)] p-[8px] shadow-[var(--shadow-small-card-style)]',
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
