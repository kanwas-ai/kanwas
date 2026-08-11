import Image from 'next/image'

export function TestimonialSection() {
  return (
    <section
      aria-labelledby="testimonial-title"
      className="flex w-full max-w-[1200px] flex-col items-center gap-[54px] px-4 md:px-8 lg:flex-row lg:px-16"
    >
      <div className="flex w-full max-w-[688px] flex-col justify-center gap-[16px]">
        <h2
          id="testimonial-title"
          className="w-full main-page-font-display text-[22px] font-normal leading-[1.45] md:text-[30px] md:leading-[1.4722] lg:text-[34px] text-[var(--color-brand-text)]"
        >
          {
            '\u201cWe brought our user calls, investor conversations, and positioning into Kanwas. Built the pitch deck, shared it, got feedback, iterated - and a week later closed our '
          }
          <strong className="font-bold">{'\u20ac4.6M pre-seed'}</strong>
          {'.'}
          <br />
          {'It felt like magic.\u201d'}
        </h2>
        <p className="w-full max-w-[490px] main-page-font-display text-[18px] leading-[28px] text-[var(--color-text-muted)]">
          - Samuel Beek, Founder,{' '}
          <a
            href="https://www.schematik.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-80 transition-opacity"
          >
            Schematik
          </a>
        </p>
      </div>
      <div className="relative w-full max-w-[318px] flex-shrink-0">
        <Image
          src="/main-page/new-landing/sam.jpg"
          alt="Portrait of Samuel Beek"
          width={636}
          height={794}
          sizes="318px"
          className="aspect-[318/397] w-full rounded-[24px] border-2 border-[var(--color-surface-white)] object-cover"
        />
        <div className="absolute bottom-[-14px] left-0 right-0 z-10 flex justify-center">
          <div style={{ animation: 'cursor-wander-2 13.5s ease-in-out infinite 2.5s', willChange: 'transform' }}>
            <Image
              src="/main-page/new-landing/cursor-sam.png"
              alt="Samuel Beek cursor"
              width={394}
              height={173}
              className="w-[130px] h-auto md:w-[170px] lg:w-[210px]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
