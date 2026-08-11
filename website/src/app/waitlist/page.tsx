import type { Metadata } from 'next'

import { WaitlistForm } from '@/components/waitlist/WaitlistForm'

export const metadata: Metadata = {
  title: 'Kanwas Waitlist',
  description:
    "We let new people in on a regular schedule. Right now we're full, but join our waitlist and we'll reach out when spots open up.",
  openGraph: {
    title: 'Kanwas Waitlist',
    description:
      "We let new people in on a regular schedule. Right now we're full, but join our waitlist and we'll reach out when spots open up.",
    images: ['/landing/images/k-og.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kanwas Waitlist',
    description:
      "We let new people in on a regular schedule. Right now we're full, but join our waitlist and we'll reach out when spots open up.",
    images: ['/landing/images/k-og.jpg'],
  },
}

export default function WaitlistPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#e9e9e9] p-4 text-[#1d1d1d]">
      <div className="w-full max-w-2xl space-y-8 text-center">
        <div className="space-y-4">
          <h1 className="main-page-font-display text-[34px] leading-[1.28] font-normal text-[var(--color-text-display)] md:text-[40px] md:leading-[1.5]">
            Join the Waitlist
          </h1>
          <p className="mx-auto max-w-xl text-base text-[#6a6667] md:text-lg">
            We let new people in on a regular schedule. Right now we're full, but join our waitlist and we'll reach out
            when spots open up.
          </p>
        </div>

        <div className="flex justify-center">
          <WaitlistForm />
        </div>

        <div className="border-t border-[#d3d3d3] pt-8">
          <p className="text-sm text-[#6a6667]">
            By joining our waitlist, you'll be among the first to know when we have availability.
          </p>
        </div>
      </div>
    </div>
  )
}
