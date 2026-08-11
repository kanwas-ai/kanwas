import dns from 'node:dns'
import net from 'node:net'
import { Agent } from 'undici'

export class SsrfError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'SsrfError'
  }
}

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
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function isBlockedIpv4(ip: string): boolean {
  const address = ipv4ToInt(ip)
  return BLOCKED_V4_CIDRS.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    return (address & mask) === (ipv4ToInt(base) & mask)
  })
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7)
    return net.isIPv4(v4) ? isBlockedIpv4(v4) : true
  }
  return /^fe[89ab]/.test(lower) || /^f[cd]/.test(lower) || lower.startsWith('ff')
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip)
  if (net.isIPv6(ip)) return isBlockedIpv6(ip)
  return true
}

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
  if (url.username || url.password) throw new SsrfError('URLs with embedded credentials are not allowed')
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname
  if (net.isIP(host) && isBlockedIp(host)) throw new SsrfError(`Refused: host ${host} is in a blocked range`)
  return url
}

function blockedError(hostname: string, address: string): NodeJS.ErrnoException {
  const error = new SsrfError(`Refused: ${hostname} resolved to blocked address ${address}`) as NodeJS.ErrnoException
  error.code = 'ESSRFBLOCKED'
  return error
}

export const ssrfSafeDispatcher = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, options, (error, addressOrList, family) => {
        if (error) return callback(error, addressOrList as never, family as never)
        if (Array.isArray(addressOrList)) {
          const blocked = addressOrList.find((entry) => isBlockedIp(entry.address))
          if (blocked) return callback(blockedError(hostname, blocked.address), [] as never)
          return callback(null, addressOrList as never)
        }
        if (isBlockedIp(addressOrList)) return callback(blockedError(hostname, addressOrList), '' as never, 0)
        return callback(null, addressOrList, family)
      })
    },
  },
  headersTimeout: 10_000,
  bodyTimeout: 15_000,
})
