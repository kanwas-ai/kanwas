import dns from 'node:dns'
import net from 'node:net'
import { Agent } from 'undici'

export class SsrfError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'SsrfError'
  }
}

// IPv4 ranges that must never be reachable from server-side fetches.
// Includes: this-network, private (RFC1918), CGNAT, loopback, link-local
// (AWS/GCP IMDS at 169.254.169.254), Shared Address Space, benchmark,
// documentation, multicast, reserved/broadcast.
const BLOCKED_V4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['255.255.255.255', 32],
]

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.')
  return (
    ((Number.parseInt(parts[0], 10) << 24) |
      (Number.parseInt(parts[1], 10) << 16) |
      (Number.parseInt(parts[2], 10) << 8) |
      Number.parseInt(parts[3], 10)) >>>
    0
  )
}

function isBlockedIpv4(ip: string): boolean {
  const addr = ipv4ToInt(ip)
  for (const [base, prefix] of BLOCKED_V4_CIDRS) {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    if ((addr & mask) === (ipv4ToInt(base) & mask)) return true
  }
  return false
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  // IPv4-mapped (::ffff:a.b.c.d) - delegate to v4 check
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7)
    return net.isIPv4(v4) ? isBlockedIpv4(v4) : true
  }
  // fe80::/10 link-local, fc00::/7 unique-local, ff00::/8 multicast
  if (/^fe[89ab]/.test(lower)) return true
  if (/^f[cd]/.test(lower)) return true
  if (lower.startsWith('ff')) return true
  return false
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip)
  if (net.isIPv6(ip)) return isBlockedIpv6(ip)
  return true
}

// Validates URL shape before any network I/O. Blocks non-http schemes,
// embedded credentials, and literal private/reserved IP hosts. Does NOT
// resolve DNS - that happens per-connect in ssrfSafeDispatcher so every
// redirect hop is re-validated (defeats DNS rebinding).
export function assertPublicHttpUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new SsrfError('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError(`Disallowed URL scheme: ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new SsrfError('URLs with embedded credentials are not allowed')
  }
  const host = url.hostname
  // Strip IPv6 brackets that URL.hostname preserves
  const ipHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  if (net.isIP(ipHost) && isBlockedIp(ipHost)) {
    throw new SsrfError(`Refused: host ${ipHost} is in a blocked range`)
  }
  return url
}

function blockedErr(hostname: string, address: string): NodeJS.ErrnoException {
  const err = new SsrfError(`Refused: ${hostname} resolved to blocked address ${address}`) as NodeJS.ErrnoException
  err.code = 'ESSRFBLOCKED'
  return err
}

// undici dispatcher whose per-connect DNS lookup re-validates every resolved
// address. Attach via fetch's `dispatcher` option; each redirect hop goes
// through this, so rebinding attacks and redirect-based SSRF are both covered.
// For literal-IP hosts undici skips the lookup entirely, so always combine
// this dispatcher with assertPublicHttpUrl() on the initial URL.
export const ssrfSafeDispatcher = new Agent({
  connect: {
    // Respect whatever `options` undici passes - in particular `all: true`
    // vs default - and dispatch the callback shape accordingly.
    lookup: (hostname: string, options: dns.LookupOptions, callback: Function) => {
      dns.lookup(hostname, options, (err: unknown, addressOrList: any, family?: number) => {
        if (err) return (callback as any)(err, addressOrList, family)
        if (Array.isArray(addressOrList)) {
          for (const entry of addressOrList as dns.LookupAddress[]) {
            if (isBlockedIp(entry.address)) {
              return (callback as any)(blockedErr(hostname, entry.address), [])
            }
          }
          return (callback as any)(null, addressOrList)
        }
        if (isBlockedIp(addressOrList)) {
          return (callback as any)(blockedErr(hostname, addressOrList), '', 0)
        }
        ;(callback as any)(null, addressOrList, family)
      })
    },
  },
  // Light protections against slow or oversized responses from hostile hosts
  headersTimeout: 10_000,
  bodyTimeout: 15_000,
})
