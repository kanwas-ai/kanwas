import posthog from 'posthog-js'
import { POSTHOG_HOST, POSTHOG_KEY } from '@/lib/analytics/config'

const posthogKey = POSTHOG_KEY
const posthogHost = POSTHOG_HOST

export const isPostHogEnabled = typeof window !== 'undefined' && Boolean(posthogKey)

if (isPostHogEnabled && posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: '2026-01-30',
    capture_pageview: 'history_change',
    capture_pageleave: 'if_capture_pageview',
    person_profiles: 'identified_only',
  })
}

export function capturePostHogEvent(eventName: string, properties?: Record<string, unknown>) {
  if (!isPostHogEnabled) {
    return
  }

  posthog.capture(eventName, properties)
}

export { posthog }
