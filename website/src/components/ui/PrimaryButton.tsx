import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface PrimaryButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  'children': ReactNode
  'className'?: string
  'aria-label': string
}

export function PrimaryButton({ children, className, type = 'button', ...props }: PrimaryButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex h-[38px] items-center justify-center rounded-[16px] px-[17px] py-[7px]',
        'bg-[image:var(--gradient-button-primary)] text-[16px] font-semibold leading-[24px]',
        'main-page-font-ui text-[var(--color-button-text-on-dark)] shadow-[var(--shadow-button-inner-glow)]',
        'cursor-pointer whitespace-nowrap transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-text)] disabled:pointer-events-none disabled:opacity-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
