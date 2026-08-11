'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const menuId = 'primary-navigation'
  const pathname = usePathname()
  const isHome = pathname === '/'

  const handleToggle = () => {
    setIsOpen((prev) => !prev)
  }

  const handleNavClick = () => {
    setIsOpen(false)
  }

  return (
    <div
      data-animation="default"
      data-collapse="medium"
      data-duration="400"
      data-easing="ease"
      data-easing2="ease"
      role="banner"
      className="relative z-[1000] mt-[10px] w-full max-w-[1200px] border-b border-[#d8d8d8] bg-transparent px-[14px] pb-[10px] pt-0"
    >
      <div className="relative flex w-full items-start justify-between rounded-[100px]">
        <a href="/" className="flex items-center justify-between pt-[6px] no-underline">
          <Image src="/landing/images/k-logo.svg" loading="lazy" width={145} height={50} alt="Kanwas logo" />
        </a>
        <div className="flex items-start">
          <nav
            id={menuId}
            role="navigation"
            className={`flex items-center justify-end max-[991px]:absolute max-[991px]:left-0 max-[991px]:right-0 max-[991px]:top-full max-[991px]:min-w-[200px] max-[991px]:hidden max-[991px]:flex-col max-[991px]:items-center max-[991px]:bg-[#c8c8c8] max-[991px]:text-center ${
              isOpen ? 'max-[991px]:flex' : ''
            }`}
          >
            {isHome ? (
              <a
                href="#why"
                className="px-[13px] py-[20px] text-[16px] leading-[19px] text-[#1d1d1d] no-underline max-[991px]:block max-[991px]:w-full"
                onClick={handleNavClick}
              >
                Why?
              </a>
            ) : (
              <a
                href="/"
                className="px-[13px] py-[20px] text-[16px] leading-[19px] text-[#1d1d1d] no-underline max-[991px]:block max-[991px]:w-full"
                onClick={handleNavClick}
              >
                What's Kanwas?
              </a>
            )}
            <a
              href="https://calendly.com/johan-kanwas/30min"
              target="_blank"
              className="px-[13px] py-[20px] text-[16px] leading-[19px] text-[#1d1d1d] no-underline max-[991px]:block max-[991px]:w-full"
              onClick={handleNavClick}
            >
              Demo
            </a>
            <a
              href="/waitlist"
              className="px-[13px] py-[20px] text-[16px] font-[600] leading-[19px] text-[#1d1d1d] no-underline max-[991px]:block max-[991px]:w-full"
              onClick={handleNavClick}
            >
              Waitlist
            </a>
          </nav>
          <button
            type="button"
            className={`hidden cursor-pointer select-none p-[18px] text-[24px] outline-none max-[991px]:block ${
              isOpen ? 'bg-[#c8c8c8] text-white' : 'bg-transparent text-[#1d1d1d]'
            }`}
            aria-controls={menuId}
            aria-expanded={isOpen}
            aria-label="Toggle navigation"
            onClick={handleToggle}
          >
            <span className="sr-only">Toggle navigation</span>
            <span aria-hidden="true" className="flex flex-col gap-[4px]">
              <span className="block h-[2px] w-[20px] bg-current" />
              <span className="block h-[2px] w-[20px] bg-current" />
              <span className="block h-[2px] w-[20px] bg-current" />
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
