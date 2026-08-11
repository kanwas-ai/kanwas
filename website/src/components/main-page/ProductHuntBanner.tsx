import Image from 'next/image'

export function ProductHuntBanner() {
  return (
    <div className="w-full bg-[#DA552F] px-4 py-2.5 text-center">
      <div className="flex flex-col items-center justify-center gap-2 sm:inline-flex sm:flex-row sm:gap-3">
        <span className="main-page-font-ui text-[13px] font-semibold leading-[20px] tracking-[0.01em] text-white">
          Thank you - we were #1 on Product Hunt!
        </span>
        <a
          href="https://www.producthunt.com/products/kanwas?embed=true&utm_source=badge-top-post-badge&utm_medium=badge&utm_campaign=badge-kanwas"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 transition-opacity hover:opacity-90"
        >
          <Image
            src="https://api.producthunt.com/widgets/embed-image/v1/top-post-badge.svg?post_id=1139956&theme=light&period=daily&t=1778493037268"
            alt="Kanwas - An open-source brain for your team | Product Hunt"
            width={250}
            height={54}
            unoptimized
          />
        </a>
      </div>
    </div>
  )
}
