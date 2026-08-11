import Image from 'next/image'
import Link from 'next/link'

type MainPageBrandProps = {
  className?: string
}

export function MainPageBrand({ className }: MainPageBrandProps) {
  return (
    <Link
      href="/"
      className={`inline-flex min-h-[44px] items-center md:min-h-0 ${className ?? ''}`.trim()}
      aria-label="Kanwas home"
    >
      <Image src="/main-page/brand/kanwas-logo.png" alt="Kanwas" width={110} height={31} />
    </Link>
  )
}
