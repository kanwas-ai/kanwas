import Image from 'next/image'
import { FeatureMediaPanel } from '@/components/ui/FeatureMediaPanel'

export function CollaborationMissionSection() {
  return (
    <section aria-labelledby="collaboration-mission-title" className="w-full max-w-[1200px]">
      <FeatureMediaPanel className="mx-auto w-full max-w-[890px]">
        <div className="relative flex h-auto min-h-[260px] md:h-[310px] w-full items-center overflow-hidden rounded-[16px] bg-[var(--color-brand-text)]">
          <Image
            src="/main-page/new-landing/bg-collab.jpg"
            alt=""
            fill
            sizes="890px"
            className="object-cover"
            aria-hidden="true"
          />
          <div className="relative mx-auto flex h-full w-full flex-col items-center justify-center px-[24px] py-[32px] md:px-[32px] md:py-0 text-center text-[var(--color-button-text-on-dark)]">
            <h2
              id="collaboration-mission-title"
              className="main-page-font-display text-[22px] font-normal leading-[30px] md:text-[28px] md:leading-[37px]"
            >
              Great work is built in collaboration between human and AI
            </h2>
            <p className="mt-[18px] main-page-font-brand text-[15px] leading-[24px] md:text-[18px] md:leading-[28px]">
              AI is making us loop in our own thoughts, in endless iterations.
            </p>
            <p className="mt-[12px] main-page-font-brand text-[15px] leading-[24px] md:text-[18px] md:leading-[28px]">
              Our mission is to build the space where human taste meets AI reasoning. Where you and your agents each
              bring what the other can’t.
            </p>
          </div>
        </div>
      </FeatureMediaPanel>
    </section>
  )
}
