import Image from 'next/image'
import { ComparisonCard } from '@/components/ui/ComparisonCard'

const rows = [
  {
    negativeRotation: 'rotate-[-2deg]',
    positiveRotation: 'rotate-[2deg]',
    logoContainerHeight: 'h-[46px]',
    logos: [
      {
        name: 'FigJam',
        src: '/main-page/new-landing/figjam.png',
        width: 153,
        height: 64,
        imgClassName: 'h-[30px] w-auto',
        wrapperHeight: 'h-[30px]',
      },
      {
        name: 'Miro',
        src: '/main-page/new-landing/miro.png',
        width: 146,
        height: 65,
        imgClassName: 'h-[30px] w-auto',
        wrapperHeight: 'h-[30px]',
      },
    ],
    arrow: '/main-page/new-landing/arrow1.svg',
    negative: (
      <>
        <strong>Whiteboards</strong> are good for sessions.{' '}
        <strong className="text-[var(--color-comparison-negative-accent)]">They can’t think with you.</strong>
      </>
    ),
    positive: (
      <>
        <strong>Kanwas</strong> is a whiteboard where{' '}
        <strong className="text-[var(--color-comparison-positive-accent)]">agents research, write & think</strong>.
      </>
    ),
  },
  {
    negativeRotation: 'rotate-0',
    positiveRotation: 'rotate-[-1deg]',
    logoContainerHeight: 'h-[36px]',
    logos: [
      {
        name: 'Claude',
        src: '/main-page/new-landing/claude.png',
        width: 172,
        height: 36,
        imgClassName: 'h-[22px] w-auto',
        wrapperHeight: 'h-[22px]',
      },
      {
        name: 'ChatGPT',
        src: '/main-page/new-landing/chatgpt.png',
        width: 148,
        height: 44,
        imgClassName: 'h-[22px] w-auto',
        wrapperHeight: 'h-[22px]',
      },
    ],
    arrow: '/main-page/new-landing/arrow2.svg',
    negative: (
      <>
        <strong>Chat</strong> is good for answers.{' '}
        <strong className="text-[var(--color-comparison-negative-accent)]">It is bad for deep, iterative work.</strong>
      </>
    ),
    positive: (
      <>
        <strong>Kanwas</strong> gives you a place to{' '}
        <strong className="text-[var(--color-comparison-positive-accent)]">
          work the question through, in the open
        </strong>
        .
      </>
    ),
  },
  {
    negativeRotation: 'rotate-[1deg]',
    positiveRotation: 'rotate-[2deg]',
    logoContainerHeight: 'h-[36px]',
    logos: [
      {
        name: 'Cognee',
        src: '/main-page/new-landing/cognee.png',
        width: 129,
        height: 47,
        imgClassName: 'h-[20px] w-auto',
        wrapperHeight: 'h-[20px]',
      },
      {
        name: 'Obsidian',
        src: '/main-page/new-landing/obsidian.png',
        width: 224,
        height: 55,
        imgClassName: 'h-[20px] w-auto',
        wrapperHeight: 'h-[20px]',
      },
    ],
    arrow: '/main-page/new-landing/arrow3.svg',
    negative: (
      <>
        <strong>Second brains</strong> store your notes.{' '}
        <strong className="text-[var(--color-comparison-negative-accent)]">But they are not thinking spaces.</strong>
      </>
    ),
    positive: (
      <>
        <strong>Kanwas</strong> turns your second brain into{' '}
        <strong className="text-[var(--color-comparison-positive-accent)]">a living board you think in</strong>.
      </>
    ),
  },
]

export function WhyTeamsSwitchComparisons() {
  return (
    <div className="flex w-full max-w-[713px] flex-col gap-[30px]">
      {rows.map((row, index) => (
        <div key={index} className="flex w-full flex-col items-center gap-4 md:flex-row md:justify-between">
          <ComparisonCard variant="negative" className={`w-full max-w-[272.645px] ${row.negativeRotation}`}>
            <div className={`mb-[13.677px] flex ${row.logoContainerHeight} items-center gap-[10px]`}>
              <span className="main-page-font-ui text-[24px] font-bold leading-[1]" aria-hidden="true">
                ❌
              </span>
              <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[4px]">
                {row.logos.map((logo) => (
                  <span key={logo.name} className={`flex ${logo.wrapperHeight} items-center`}>
                    <Image
                      src={logo.src}
                      alt={logo.name}
                      width={logo.width}
                      height={logo.height}
                      sizes="120px"
                      className={`${logo.imgClassName} object-contain`}
                    />
                  </span>
                ))}
              </div>
            </div>
            {row.negative}
          </ComparisonCard>
          <Image
            src={row.arrow}
            alt=""
            width={62}
            height={28}
            sizes="62px"
            className="h-[28px] w-[62px] rotate-90 object-contain opacity-70 md:rotate-0"
            aria-hidden="true"
          />
          <ComparisonCard variant="positive" className={`w-full max-w-[272.645px] ${row.positiveRotation}`}>
            <div className="mb-[13.677px] h-[40.551px]" aria-hidden="true">
              ✅
            </div>
            {row.positive}
          </ComparisonCard>
        </div>
      ))}
    </div>
  )
}
