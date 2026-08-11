import { mainPageCopy } from '@/content/main-page/content'
import { MainPageBrand } from './MainPageBrand'

export function MainPageFooter() {
  return (
    <footer
      data-section="footer"
      className="mx-auto flex h-auto w-full max-w-[1200px] flex-col gap-5 px-4 md:h-[54px] md:flex-row md:items-center md:justify-between md:gap-0 md:px-6 xl:px-0"
    >
      <nav className="flex flex-wrap items-center gap-x-[18px] gap-y-1">
        {mainPageCopy.footer.links.map((item) =>
          item === 'DM Johan on LinkedIn to get access 👋' ? (
            <a
              key={item}
              href="https://www.linkedin.com/in/johancutych/"
              target="_blank"
              rel="noopener noreferrer"
              className="main-page-font-ui inline-flex min-h-[44px] items-center text-[16px] leading-[1.5] font-medium text-[rgba(40,39,38,0.7)] transition-colors hover:text-[var(--color-text-strong)] md:min-h-0"
            >
              {item}
            </a>
          ) : (
            <a
              key={item}
              href="#"
              className="main-page-font-ui inline-flex min-h-[44px] items-center text-[16px] leading-[1.5] font-medium text-[rgba(40,39,38,0.7)] transition-colors hover:text-[var(--color-text-strong)] md:min-h-0"
            >
              {item}
            </a>
          )
        )}
      </nav>

      <MainPageBrand className="inline-flex items-center gap-[7px]" />
    </footer>
  )
}
