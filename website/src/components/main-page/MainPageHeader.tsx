import { mainPageCopy } from '@/content/main-page/content'
import { MainPageBrand } from './MainPageBrand'

export function MainPageHeader() {
  const loginLabel = mainPageCopy.header.actions[0] ?? 'Log in'
  const navItems = mainPageCopy.header.nav

  return (
    <header
      data-section="header"
      className="mx-auto mt-[8px] flex h-[54px] w-full max-w-[1200px] items-center justify-between px-4 md:px-6 xl:px-0"
    >
      <div className="flex items-center gap-[26px]">
        <MainPageBrand className="inline-flex items-center gap-[7px]" />
        {navItems.length > 0 ? (
          <nav className="hidden items-center gap-[18px] md:flex">
            {navItems.map((item) => (
              <a
                key={item}
                href="#"
                className="main-page-font-ui inline-flex min-h-[44px] items-center text-[14px] leading-[1.7143] font-medium text-[rgba(40,39,38,0.7)] transition-colors hover:text-[var(--color-text-strong)] md:min-h-0"
              >
                {item}
              </a>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="flex items-center">
        <a
          href="#"
          className="main-page-font-ui inline-flex min-h-[44px] min-w-[44px] items-center text-[14px] leading-[1.7143] font-medium text-[var(--color-text-strong)] transition-colors hover:text-[rgba(40,39,38,0.7)] md:min-h-0 md:min-w-0"
        >
          {loginLabel}
        </a>
      </div>
    </header>
  )
}
