import Image from 'next/image'
import { featureCards } from '@/content/main-page/content'

const FEATURE_MEDIA_WIDTH = 328
const FEATURE_MEDIA_HEIGHT = 108

const featureIllustrationLayout: Record<
  string,
  {
    x: number
    y: number
    width: number
    height: number
    backgroundX: number
    backgroundY: number
    backgroundWidth: number
    backgroundHeight: number
    pointerX?: number
    pointerY?: number
    pointerWidth?: number
    pointerHeight?: number
    mobileX?: number
    mobileY?: number
    mobileWidth?: number
    mobileHeight?: number
    mobilePointerX?: number
    mobilePointerY?: number
    mobilePointerWidth?: number
    mobilePointerHeight?: number
  }
> = {
  'card-01': {
    x: 18,
    y: 19,
    width: 345,
    height: 69,
    backgroundX: 0.5,
    backgroundY: 0,
    backgroundWidth: 328,
    backgroundHeight: 108,
    pointerX: 247,
    pointerY: 76,
    pointerWidth: 32,
    pointerHeight: 32,
  },
  'card-02': {
    x: 110.84,
    y: 26.27,
    width: 105.5,
    height: 52.5,
    backgroundX: 0.5,
    backgroundY: 0,
    backgroundWidth: 328,
    backgroundHeight: 108,
    pointerX: 180,
    pointerY: 64,
    pointerWidth: 32,
    pointerHeight: 32,
  },
  'card-03': {
    x: 44.5,
    y: 28,
    width: 240,
    height: 119,
    backgroundX: 0.5,
    backgroundY: 0,
    backgroundWidth: 328,
    backgroundHeight: 108,
    pointerX: 154,
    pointerY: 74,
    pointerWidth: 32,
    pointerHeight: 32,
  },
  'card-04': {
    x: 44.5,
    y: -136,
    width: 240,
    height: 326,
    backgroundX: 0.5,
    backgroundY: 0,
    backgroundWidth: 328,
    backgroundHeight: 108,
  },
  'card-05': {
    x: -34.5,
    y: 27,
    width: 308.83,
    height: 120,
    backgroundX: -0.5,
    backgroundY: 0,
    backgroundWidth: 329,
    backgroundHeight: 108,
    pointerX: 198,
    pointerY: 58,
    pointerWidth: 32,
    pointerHeight: 32,
  },
  'card-06': {
    x: 39.5,
    y: 29,
    width: 324,
    height: 118,
    backgroundX: -0.5,
    backgroundY: 0,
    backgroundWidth: 337,
    backgroundHeight: 108,
    pointerX: 97.5,
    pointerY: 82,
    pointerWidth: 32.82,
    pointerHeight: 32,
  },
  'card-07': {
    x: -11.8,
    y: 19,
    width: 379,
    height: 69,
    backgroundX: -0.5,
    backgroundY: 0,
    backgroundWidth: 329,
    backgroundHeight: 108,
    pointerX: 172,
    pointerY: 76,
    pointerWidth: 32,
    pointerHeight: 32,
  },
  'card-08': {
    x: 43,
    y: 22,
    width: 510,
    height: 70,
    backgroundX: 0.5,
    backgroundY: 0,
    backgroundWidth: 328,
    backgroundHeight: 108,
    mobileX: 28,
    mobileY: 20,
    mobileWidth: 470,
    mobileHeight: 64.51,
  },
  'card-09': {
    x: 42,
    y: -136,
    width: 313,
    height: 232,
    backgroundX: 0.5,
    backgroundY: 0,
    backgroundWidth: 328,
    backgroundHeight: 108,
    pointerX: 87,
    pointerY: 80,
    pointerWidth: 32,
    pointerHeight: 32,
  },
  'card-10': {
    x: 28.57,
    y: 0,
    width: 338.86,
    height: 229,
    backgroundX: -0.5,
    backgroundY: 0,
    backgroundWidth: 329,
    backgroundHeight: 108,
  },
  'card-11': {
    x: 12,
    y: -154,
    width: 303.35,
    height: 272,
    backgroundX: -0.5,
    backgroundY: -1,
    backgroundWidth: 329,
    backgroundHeight: 109,
  },
  'card-12': {
    x: 60,
    y: 17,
    width: 315,
    height: 218,
    backgroundX: 0.5,
    backgroundY: 0,
    backgroundWidth: 328,
    backgroundHeight: 108,
    pointerX: 112,
    pointerY: 64,
    pointerWidth: 32,
    pointerHeight: 32,
  },
}

function asPercent(value: number, total: number) {
  return `${(value / total) * 100}%`
}

function getAbsoluteStyle({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return {
    left: asPercent(x, FEATURE_MEDIA_WIDTH),
    top: asPercent(y, FEATURE_MEDIA_HEIGHT),
    width: asPercent(width, FEATURE_MEDIA_WIDTH),
    height: asPercent(height, FEATURE_MEDIA_HEIGHT),
  }
}

function FeatureCard({ id, copy, backgroundSrc, illustrationSrc }: (typeof featureCards)[number]) {
  const illustrationLayout = featureIllustrationLayout[id]
  const hasMobileIllustrationLayout =
    illustrationLayout.mobileX !== undefined &&
    illustrationLayout.mobileY !== undefined &&
    illustrationLayout.mobileWidth !== undefined &&
    illustrationLayout.mobileHeight !== undefined
  const hasPointer = illustrationLayout.pointerX !== undefined && illustrationLayout.pointerY !== undefined
  const hasMobilePointer =
    illustrationLayout.mobilePointerX !== undefined && illustrationLayout.mobilePointerY !== undefined

  return (
    <article
      data-role="feature-card"
      className="group/feature-card flex min-h-[215px] w-full max-w-[384px] flex-col justify-center gap-[13px] overflow-hidden rounded-[21px] bg-[var(--color-surface-card)] px-[24px] pb-[22px] pt-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.055),inset_0_0_40px_rgba(255,255,255,0.9)] ring-2 ring-inset ring-[var(--color-border)] max-[767px]:min-h-0 max-[767px]:justify-start max-[767px]:gap-[10px] max-[767px]:p-4"
    >
      <div className="flex justify-center">
        <div
          data-role="feature-card-media"
          className="relative aspect-[328/108] w-full max-w-[328px] overflow-hidden rounded-[9px] bg-[#D9D9D9]"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[9px]">
            <Image
              src={backgroundSrc}
              alt=""
              aria-hidden="true"
              width={illustrationLayout.backgroundWidth}
              height={illustrationLayout.backgroundHeight}
              sizes={`${illustrationLayout.backgroundWidth}px`}
              className="absolute max-w-none transition-transform duration-500 ease-out group-hover/feature-card:scale-[1.015]"
              style={{
                left: asPercent(illustrationLayout.backgroundX, FEATURE_MEDIA_WIDTH),
                top: asPercent(illustrationLayout.backgroundY, FEATURE_MEDIA_HEIGHT),
                width: asPercent(illustrationLayout.backgroundWidth, FEATURE_MEDIA_WIDTH),
                height: asPercent(illustrationLayout.backgroundHeight, FEATURE_MEDIA_HEIGHT),
              }}
            />
          </div>
          <Image
            data-role="feature-card-illustration"
            src={illustrationSrc}
            alt=""
            aria-hidden="true"
            width={illustrationLayout.width}
            height={illustrationLayout.height}
            sizes={`${illustrationLayout.width}px`}
            className={`absolute max-w-none drop-shadow-[0_0_28px_rgba(0,0,0,0.5)] transition-all duration-500 ease-out group-hover/feature-card:-translate-y-1.5 group-hover/feature-card:drop-shadow-[0_0_28px_rgba(0,0,0,0.7)] ${hasMobileIllustrationLayout ? 'max-[767px]:hidden' : ''}`}
            style={getAbsoluteStyle({
              x: illustrationLayout.x,
              y: illustrationLayout.y,
              width: illustrationLayout.width,
              height: illustrationLayout.height,
            })}
          />

          {hasMobileIllustrationLayout ? (
            <Image
              data-role="feature-card-illustration-mobile"
              src={illustrationSrc}
              alt=""
              aria-hidden="true"
              width={illustrationLayout.mobileWidth ?? illustrationLayout.width}
              height={illustrationLayout.mobileHeight ?? illustrationLayout.height}
              sizes={`${illustrationLayout.mobileWidth ?? illustrationLayout.width}px`}
              className="absolute hidden max-w-none drop-shadow-[0_0_28px_rgba(0,0,0,0.5)] transition-all duration-500 ease-out group-hover/feature-card:-translate-y-1.5 group-hover/feature-card:drop-shadow-[0_0_28px_rgba(0,0,0,0.7)] max-[767px]:block"
              style={getAbsoluteStyle({
                x: illustrationLayout.mobileX ?? illustrationLayout.x,
                y: illustrationLayout.mobileY ?? illustrationLayout.y,
                width: illustrationLayout.mobileWidth ?? illustrationLayout.width,
                height: illustrationLayout.mobileHeight ?? illustrationLayout.height,
              })}
            />
          ) : null}

          {hasPointer ? (
            <Image
              src="/main-page/features/pointer.png"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className={`pointer-events-none absolute h-8 w-8 transition-transform duration-500 ease-out group-hover/feature-card:translate-x-[1px] group-hover/feature-card:-translate-y-1.5 ${hasMobilePointer ? 'max-[767px]:hidden' : ''}`}
              style={getAbsoluteStyle({
                x: illustrationLayout.pointerX ?? 0,
                y: illustrationLayout.pointerY ?? 0,
                width: illustrationLayout.pointerWidth ?? 32,
                height: illustrationLayout.pointerHeight ?? 32,
              })}
            />
          ) : null}

          {hasPointer && hasMobilePointer ? (
            <Image
              src="/main-page/features/pointer.png"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className="pointer-events-none absolute hidden h-8 w-8 transition-transform duration-500 ease-out group-hover/feature-card:translate-x-[1px] group-hover/feature-card:-translate-y-1.5 max-[767px]:block"
              style={getAbsoluteStyle({
                x: illustrationLayout.mobilePointerX ?? illustrationLayout.pointerX ?? 0,
                y: illustrationLayout.mobilePointerY ?? illustrationLayout.pointerY ?? 0,
                width: illustrationLayout.mobilePointerWidth ?? illustrationLayout.pointerWidth ?? 32,
                height: illustrationLayout.mobilePointerHeight ?? illustrationLayout.pointerHeight ?? 32,
              })}
            />
          ) : null}
        </div>
      </div>

      <p className="main-page-font-brand w-full text-[16px] leading-[24px] font-medium text-[rgba(29,29,29,0.5)] [&_strong]:font-bold [&_strong]:text-[var(--foreground)] max-[767px]:text-[16px] max-[767px]:leading-[1.35]">
        {copy}
      </p>
    </article>
  )
}

export function FeaturesGrid() {
  return (
    <section data-section="features-grid" className="mt-[29px] w-full px-4 sm:px-6 lg:px-0">
      <div className="mx-auto grid w-fit grid-cols-1 justify-items-center gap-6 md:grid-cols-2 lg:grid-cols-3">
        {featureCards.map((card) => (
          <FeatureCard key={card.id} {...card} />
        ))}
      </div>
    </section>
  )
}
