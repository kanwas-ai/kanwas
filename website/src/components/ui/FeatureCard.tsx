import type { HTMLAttributes, ReactNode } from 'react'

interface FeatureCardProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'title'> {
  icon: string
  title: ReactNode
  body: ReactNode
  className?: string
}

function getFontAwesomeIconClassName(icon: string) {
  return icon.startsWith('fa-') ? icon : `fa-solid fa-${icon}`
}

export function FeatureCard({ icon, title, body, className, ...props }: FeatureCardProps) {
  return (
    <article
      className={[
        'relative flex flex-col items-start justify-start gap-[12px] overflow-hidden rounded-[24px]',
        'border-2 border-[var(--color-border-card-new)] bg-[var(--color-surface-card-new)] px-[24px] pb-[22px] pt-[24px]',
        'shadow-[var(--shadow-small-card-style)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      <div className="w-full main-page-font-ui text-[20px] leading-[20px] text-[var(--color-text-card-icon-muted-new)]">
        <i className={getFontAwesomeIconClassName(icon)} aria-hidden="true" />
      </div>
      <div className="w-full main-page-font-brand text-[18px] font-medium leading-[24px] text-[var(--color-text-primary)]">
        {title}
      </div>
      <div className="w-full main-page-font-brand text-[14px] font-medium leading-[20px] text-[var(--color-text-card-muted-new)]">
        {body}
      </div>
    </article>
  )
}
