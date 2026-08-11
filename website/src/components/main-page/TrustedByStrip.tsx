import Image from 'next/image'

const trustedLogos = [
  {
    name: 'Veed',
    src: '/main-page/new-landing/veed.png',
    width: 146,
    height: 92,
    className: 'h-[46px] w-auto',
  },
  {
    name: 'Wix',
    src: '/main-page/new-landing/wix.png',
    width: 72,
    height: 28,
    className: 'h-[14px] w-auto',
  },
  {
    name: 'Softpay',
    src: '/main-page/new-landing/softpay.png',
    width: 124,
    height: 92,
    className: 'h-[46px] w-auto',
  },
  {
    name: 'TheFork',
    src: '/main-page/new-landing/thefork.png',
    width: 148,
    height: 28,
    className: 'h-[14px] w-auto',
  },
  {
    name: 'Grammarly',
    src: '/main-page/new-landing/gramarly.png',
    width: 162,
    height: 58,
    className: 'h-[29px] w-auto',
  },
  {
    name: 'Quanos',
    src: '/main-page/new-landing/quanos.png',
    width: 124,
    height: 25,
    className: 'h-[12.193px] w-auto',
  },
]

export function TrustedByStrip() {
  return (
    <section aria-labelledby="trusted-by-title" className="w-full max-w-[1200px] px-4 md:px-8 lg:px-16">
      <div className="w-full max-w-[687px]">
        <h2
          id="trusted-by-title"
          className="main-page-font-brand text-[12px] font-bold uppercase leading-[32px] text-[var(--color-brand-text-40)]"
        >
          TRUSTED BY DEEP THINKERS IN
        </h2>
        <div className="mt-[-3px] flex flex-wrap items-center gap-x-[24px] gap-y-[12px] md:h-[46px] md:flex-nowrap md:gap-[40px]">
          {trustedLogos.map((logo) => (
            <span key={logo.name} className="flex h-[46px] items-center">
              <Image
                src={logo.src}
                alt={logo.name}
                width={logo.width}
                height={logo.height}
                sizes="90px"
                className={`${logo.className} object-contain opacity-50`}
              />
            </span>
          ))}
          <p className="main-page-font-brand whitespace-nowrap text-[10px] font-bold leading-[32px] text-[var(--color-brand-text-40)]">
            and more...
          </p>
        </div>
      </div>
    </section>
  )
}
