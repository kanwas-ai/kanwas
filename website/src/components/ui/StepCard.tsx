import Image from 'next/image'
import type { HTMLAttributes, ReactNode } from 'react'

type StepCardStep = 1 | 2 | 3

interface StepCardProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'title'> {
  step: StepCardStep
  title: ReactNode
  image: {
    src: string
    alt: string
    width: number
    height: number
  }
  children?: ReactNode
  className?: string
}

export function StepCard({ step, title, image, children, className, ...props }: StepCardProps) {
  return (
    <article
      className={[
        'flex flex-col items-center justify-center gap-[19px] overflow-hidden rounded-[24px] px-[24px] pb-[22px] pt-[24px]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      <Image
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        sizes="(min-width: 768px) 220px, 60vw"
        className="h-[160px] w-auto object-contain"
        priority={step === 1}
      />
      <div className="flex flex-col items-center gap-[4px] text-center">
        <div className="main-page-font-brand text-[20px] font-semibold leading-[36px] text-[var(--color-brand-text)]">
          {title}
        </div>
        {children ? (
          <div className="main-page-font-brand text-[16px] font-normal leading-[24px] text-[var(--color-text-body-new)]">
            {children}
          </div>
        ) : null}
      </div>
    </article>
  )
}
