import Image from 'next/image'
import { FeatureMediaPanel } from '@/components/ui/FeatureMediaPanel'

interface FeatureShowcaseSectionProps {
  headingId: string
  title: string
  body: string
  imageSrc: string
  imageLabel: string
}

export function FeatureShowcaseSection({ headingId, title, body, imageSrc, imageLabel }: FeatureShowcaseSectionProps) {
  return (
    <section
      aria-labelledby={headingId}
      className="flex w-full flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex w-full max-w-[516.5px] flex-col gap-[8px]">
        <h2
          id={headingId}
          className="main-page-font-brand text-[18px] font-semibold leading-[28px] md:text-[22px] md:leading-[36px] text-[var(--color-brand-text)]"
        >
          {title}
        </h2>
        <p className="main-page-font-brand text-[16px] leading-[26px] md:text-[20px] md:leading-[32px] text-[var(--color-text-body-new)]">
          {body}
        </p>
      </div>
      <FeatureMediaPanel className="aspect-[647/315] w-full lg:max-w-[647px]">
        <Image
          src={imageSrc}
          alt={imageLabel}
          width={1262}
          height={598}
          sizes="(min-width: 1200px) 631px, 100vw"
          className="h-full w-full rounded-[16px] object-cover"
        />
      </FeatureMediaPanel>
    </section>
  )
}
