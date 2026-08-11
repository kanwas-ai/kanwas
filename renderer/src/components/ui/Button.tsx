import { forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'inverted'
type ButtonSize = 'sm' | 'md' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  icon?: string
  children?: React.ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary-button-background text-primary-button-foreground hover:bg-primary-button-active-background',
  secondary: 'border border-outline text-foreground hover:bg-block-highlight',
  danger: 'border border-outline text-status-error hover:bg-status-error/10',
  ghost: 'text-foreground-muted hover:bg-block-highlight',
  inverted: 'bg-foreground text-canvas hover:bg-foreground/90 font-medium',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  icon: 'w-8 h-8',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', isLoading, icon, children, className = '', disabled, ...props }, ref) => {
    const isDisabled = disabled || isLoading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          rounded-md
          transition-colors cursor-pointer
          flex items-center justify-center gap-2
          disabled:opacity-50 disabled:cursor-not-allowed
          ${VARIANT_CLASSES[variant]}
          ${SIZE_CLASSES[size]}
          ${className}
        `}
        {...props}
      >
        {isLoading ? (
          <>
            <i className="fa-solid fa-spinner fa-spin text-[12px]" />
            {children}
          </>
        ) : (
          <>
            {icon && <i className={`${icon} text-xs`} />}
            {children}
          </>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
