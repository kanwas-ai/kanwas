import Image from 'next/image'

const cursors = [
  {
    src: '/main-page/new-landing/cursor-kanwas.png',
    alt: 'Kanwas cursor',
    width: 245,
    height: 140,
    className: 'top-[36%] left-[34%]',
    style: { animation: 'cursor-wander-1 11.3s ease-in-out infinite' },
  },
  {
    src: '/main-page/new-landing/cursor-predrag.png',
    alt: 'Predrag cursor',
    width: 245,
    height: 140,
    className: 'top-[30%] left-[58%]',
    style: { animation: 'cursor-wander-2 14.7s ease-in-out infinite 1.8s' },
  },
  {
    src: '/main-page/new-landing/cursor-marek.png',
    alt: 'Marek cursor',
    width: 221,
    height: 140,
    className: 'top-[44%] left-[78%]',
    style: { animation: 'cursor-wander-3 12.1s ease-in-out infinite 0.7s' },
  },
  {
    src: '/main-page/new-landing/cursor-johan.png',
    alt: 'Johan cursor',
    width: 219,
    height: 140,
    className: 'top-[61%] left-[59%]',
    style: { animation: 'cursor-wander-4 16.9s ease-in-out infinite 3.1s' },
  },
]

export function HeroMediaSection() {
  return (
    <section aria-label="Kanwas product preview" className="w-full">
      <div className="relative mx-auto aspect-[1639/1002] w-full max-w-[1639px] overflow-hidden rounded-[28px] bg-[var(--color-surface-panel-new)] md:rounded-[36px]">
        <Image
          src="/main-page/new-landing/background-hero.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 1639px) 1639px, 100vw"
          className="object-cover"
          aria-hidden="true"
        />
        <Image
          src="/main-page/new-landing/main-hero.jpg"
          alt="Kanwas product canvas with onboarding board, shared notes, and stakeholder context"
          width={2788}
          height={1622}
          priority
          sizes="(min-width: 1639px) 1394px, 85vw"
          className="absolute inset-0 m-auto aspect-[1394/811] w-[93%] rounded-[21px] object-cover shadow-[0_0_92px_0_var(--color-shadow-card-drop)]"
        />
        {cursors.map((cursor) => (
          <div
            key={cursor.alt}
            className={`absolute z-10 ${cursor.className}`}
            style={{ ...cursor.style, willChange: 'transform' }}
          >
            <Image
              src={cursor.src}
              alt={cursor.alt}
              width={cursor.width}
              height={cursor.height}
              className="h-[58px] w-auto md:h-[77px] lg:h-[96px]"
            />
          </div>
        ))}
      </div>
    </section>
  )
}
