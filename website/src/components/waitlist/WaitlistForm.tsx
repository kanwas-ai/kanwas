'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'

import { MainPageBrand } from '@/components/main-page/MainPageBrand'

type WaitlistFormData = {
  name: string
  companyUrl: string
  role: string
  pmCount: string
  email: string
}

const initialFormData: WaitlistFormData = {
  name: '',
  companyUrl: '',
  role: '',
  pmCount: '',
  email: '',
}

export function WaitlistForm() {
  const [formData, setFormData] = useState<WaitlistFormData>(initialFormData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('https://api.kanwas.ai/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          companyUrl: formData.companyUrl,
          role: formData.role,
          numberOfPms: formData.pmCount,
        }),
      })

      if (response.ok) {
        await response.json()
        setIsSuccess(true)
        setFormData(initialFormData)
      } else if (response.status === 422) {
        setError('Please check your information and try again.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } catch {
      setError('Failed to submit. Please check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: keyof WaitlistFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  if (isSuccess) {
    return (
      <div className="w-full max-w-md overflow-hidden rounded-[21px] bg-white p-8 shadow-[0_8px_30px_rgba(0,0,0,0.055),inset_0_0_40px_rgba(255,255,255,0.9)] ring-2 ring-inset ring-[var(--color-border)]">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1d1d1d]/10">
            <svg className="h-8 w-8 text-[#1d1d1d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-serif font-semibold text-[#1d1d1d]">You're on the list!</h3>
          <p className="text-[#6a6667]">We'll reach out when spots open up.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <form
        onSubmit={handleSubmit}
        className="space-y-5 overflow-hidden rounded-[21px] bg-white p-8 shadow-[0_8px_30px_rgba(0,0,0,0.055),inset_0_0_40px_rgba(255,255,255,0.9)] ring-2 ring-inset ring-[var(--color-border)]"
      >
        <MainPageBrand className="justify-center" />

        <div className="space-y-2 text-left">
          <label htmlFor="name" className="block text-sm font-medium text-[#1d1d1d]">
            Name
          </label>
          <input
            id="name"
            type="text"
            placeholder="John Doe"
            value={formData.name}
            onChange={(event) => handleInputChange('name', event.target.value)}
            required
            disabled={isSubmitting}
            className="h-9 w-full rounded-[14px] border border-[#d6d6d6] bg-white px-3 text-base text-[#1d1d1d] shadow-xs placeholder:text-[#6a6667] transition focus-visible:border-[#1d1d1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1d]/15 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
          />
        </div>

        <div className="space-y-2 text-left">
          <label htmlFor="companyUrl" className="block text-sm font-medium text-[#1d1d1d]">
            Company URL
          </label>
          <input
            id="companyUrl"
            type="text"
            placeholder="kanwas.io"
            value={formData.companyUrl}
            onChange={(event) => handleInputChange('companyUrl', event.target.value)}
            required
            disabled={isSubmitting}
            className="h-9 w-full rounded-[14px] border border-[#d6d6d6] bg-white px-3 text-base text-[#1d1d1d] shadow-xs placeholder:text-[#6a6667] transition focus-visible:border-[#1d1d1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1d]/15 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
          />
        </div>

        <div className="space-y-2 text-left">
          <label htmlFor="role" className="block text-sm font-medium text-[#1d1d1d]">
            Role
          </label>
          <input
            id="role"
            type="text"
            placeholder="Product Manager"
            value={formData.role}
            onChange={(event) => handleInputChange('role', event.target.value)}
            required
            disabled={isSubmitting}
            className="h-9 w-full rounded-[14px] border border-[#d6d6d6] bg-white px-3 text-base text-[#1d1d1d] shadow-xs placeholder:text-[#6a6667] transition focus-visible:border-[#1d1d1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1d]/15 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
          />
        </div>

        <div className="space-y-2 text-left">
          <label htmlFor="pm-count" className="block text-sm font-medium text-[#1d1d1d]">
            Number of PMs in Company
          </label>
          <div className="relative">
            <select
              id="pm-count"
              value={formData.pmCount}
              onChange={(event) => handleInputChange('pmCount', event.target.value)}
              disabled={isSubmitting}
              required
              className={`h-9 w-full appearance-none rounded-[14px] border border-[#d6d6d6] bg-white px-3 pr-9 text-base shadow-xs transition focus-visible:border-[#1d1d1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1d]/15 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm ${
                formData.pmCount ? 'text-[#1d1d1d]' : 'text-[#6a6667]'
              }`}
            >
              <option value="" disabled>
                Select...
              </option>
              <option value="none">None</option>
              <option value="1-5">1-5</option>
              <option value="5-10">5-10</option>
              <option value="10-20">10-20</option>
              <option value="20+">20+</option>
            </select>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6a6667]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="space-y-2 text-left">
          <label htmlFor="email" className="block text-sm font-medium text-[#1d1d1d]">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="john@example.com"
            value={formData.email}
            onChange={(event) => handleInputChange('email', event.target.value)}
            required
            disabled={isSubmitting}
            className="h-9 w-full rounded-[14px] border border-[#d6d6d6] bg-white px-3 text-base text-[#1d1d1d] shadow-xs placeholder:text-[#6a6667] transition focus-visible:border-[#1d1d1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1d]/15 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
          />
        </div>

        {error ? (
          <div className="rounded-[12px] border border-[#d74843]/20 bg-[#d74843]/10 p-3">
            <p className="text-sm text-[#d74843]">{error}</p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="main-page-font-ui h-[38px] w-full cursor-pointer rounded-[16px] border border-transparent text-[16px] leading-[1.5] font-bold text-white shadow-[0_3px_5px_0_rgba(0,0,0,0.35),inset_0_0_6px_0_rgba(255,255,255,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:brightness-[1.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1d]/25 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background:
              'linear-gradient(180deg, #393939 0%, #1D1D1D 100%) padding-box, linear-gradient(180deg, #727272 0%, #000000 100%) border-box',
          }}
        >
          {isSubmitting ? 'Joining...' : 'Join Waitlist'}
        </button>
      </form>
    </div>
  )
}
