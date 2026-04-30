type EmbedPermission =
  | 'allow-forms'
  | 'allow-popups'
  | 'allow-popups-to-escape-sandbox'
  | 'allow-presentation'
  | 'allow-same-origin'
  | 'allow-scripts'
  | 'allow-top-navigation'

type EmbedRenderMode = 'src' | 'srcDoc'

export type EmbedDefinition = {
  type: string
  hostnames: readonly string[]
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  isAspectRatioLocked?: boolean
  embedOnPaste?: boolean
  sandboxPermissions?: readonly EmbedPermission[]
  toEmbedUrl: (url: string) => string | undefined
  toSrcDoc?: (url: string) => string | undefined
}

export type ResolvedEmbed = {
  definition: EmbedDefinition
  url: string
  renderMode: EmbedRenderMode
  embedUrl?: string
  srcDoc?: string
}

const DEFAULT_SANDBOX_PERMISSIONS: readonly EmbedPermission[] = [
  'allow-forms',
  'allow-popups',
  'allow-same-origin',
  'allow-scripts',
]

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])

const joinPermissions = (permissions: readonly EmbedPermission[]) => permissions.join(' ')

const buildUrl = (input: string) => {
  try {
    return new URL(input)
  } catch {
    return undefined
  }
}

export const isSafeExternalUrl = (input: string) => {
  const url = buildUrl(input)
  return !!url && ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)
}

const matchHostname = (pattern: string, hostname: string) => {
  const normalizedPattern = pattern.replace(/^www\./, '')
  const normalizedHostname = hostname.replace(/^www\./, '')
  const escapedPattern = normalizedPattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*')

  return new RegExp(`^${escapedPattern}$`, 'i').test(normalizedHostname)
}

const matchesDefinitionHost = (definition: EmbedDefinition, url: URL) => {
  const hostname = url.host.replace(/^www\./, '')
  return definition.hostnames.some((pattern) => matchHostname(pattern, hostname))
}

const gistSrcDoc = (gistId: string) =>
  `
<!doctype html>
<html>
  <head>
    <base target="_blank" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
        background: #ffffff;
      }

      .gist,
      .gist-file {
        height: 100%;
      }

      .gist .gist-file {
        margin: 0;
        border: 0;
        border-radius: 0;
        display: grid;
        grid-template-rows: 1fr auto;
      }
    </style>
  </head>
  <body>
    <script src="https://gist.github.com/${gistId}.js"></script>
  </body>
</html>`.trim()

export const EMBED_DEFINITIONS: readonly EmbedDefinition[] = [
  {
    type: 'figma',
    hostnames: ['figma.com'],
    width: 720,
    height: 500,
    embedOnPaste: true,
    toEmbedUrl: (url) => {
      if (
        /^https:\/\/([\w.-]+\.)?figma\.com\/(file|proto|design)\/[0-9a-zA-Z]{22,128}(?:\/.*)?$/i.test(url) &&
        !url.includes('figma.com/embed')
      ) {
        return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
      }

      return undefined
    },
  },
  {
    type: 'youtube',
    hostnames: ['*.youtube.com', 'youtube.com', 'youtu.be'],
    width: 800,
    height: 450,
    isAspectRatioLocked: true,
    embedOnPaste: true,
    sandboxPermissions: [
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-presentation',
      'allow-same-origin',
      'allow-scripts',
    ],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (!urlObj) return undefined

      const hostname = urlObj.hostname.replace(/^www\./, '')
      if (hostname === 'youtu.be') {
        const videoId = urlObj.pathname.split('/').filter(Boolean)[0]
        if (!videoId) return undefined

        const searchParams = new URLSearchParams(urlObj.search)
        const timeStart = searchParams.get('t')
        if (timeStart) {
          searchParams.set('start', timeStart)
          searchParams.delete('t')
        }

        const search = searchParams.toString()
        return `https://www.youtube.com/embed/${videoId}${search ? `?${search}` : ''}`
      }

      if ((hostname === 'youtube.com' || hostname === 'm.youtube.com') && /^\/watch/.test(urlObj.pathname)) {
        const videoId = urlObj.searchParams.get('v')
        if (!videoId) return undefined

        const searchParams = new URLSearchParams(urlObj.search)
        searchParams.delete('v')
        const timeStart = searchParams.get('t')
        if (timeStart) {
          searchParams.set('start', timeStart)
          searchParams.delete('t')
        }

        const search = searchParams.toString()
        return `https://www.youtube.com/embed/${videoId}${search ? `?${search}` : ''}`
      }

      return undefined
    },
  },
  {
    type: 'vimeo',
    hostnames: ['vimeo.com', 'player.vimeo.com'],
    width: 640,
    height: 360,
    isAspectRatioLocked: true,
    embedOnPaste: true,
    sandboxPermissions: ['allow-forms', 'allow-popups', 'allow-presentation', 'allow-same-origin', 'allow-scripts'],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (!urlObj) return undefined

      if (urlObj.hostname.replace(/^www\./, '') === 'vimeo.com' && /^\/[0-9]+/.test(urlObj.pathname)) {
        return `https://player.vimeo.com/video/${urlObj.pathname.split('/')[1]}?title=0&byline=0`
      }

      return undefined
    },
  },
  {
    type: 'spotify',
    hostnames: ['open.spotify.com'],
    width: 720,
    height: 500,
    minHeight: 500,
    embedOnPaste: true,
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (urlObj && /^\/(artist|album|playlist|track|episode|show)\//.test(urlObj.pathname)) {
        return `${urlObj.origin}/embed${urlObj.pathname}`
      }

      return undefined
    },
  },
  {
    type: 'codesandbox',
    hostnames: ['codesandbox.io'],
    width: 720,
    height: 500,
    minWidth: 300,
    minHeight: 300,
    embedOnPaste: true,
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      const matches = urlObj?.pathname.match(/\/s\/([^/]+)\/?/)
      return matches ? `https://codesandbox.io/embed/${matches[1]}` : undefined
    },
  },
  {
    type: 'codepen',
    hostnames: ['codepen.io'],
    width: 520,
    height: 400,
    minWidth: 300,
    minHeight: 300,
    embedOnPaste: true,
    toEmbedUrl: (url) => {
      const matches = url.match(/^https:\/\/codepen\.io\/([^/]+)\/pen\/([^/?#]+)/i)
      return matches ? `https://codepen.io/${matches[1]}/embed/${matches[2]}` : undefined
    },
  },
  {
    type: 'replit',
    hostnames: ['replit.com'],
    width: 720,
    height: 500,
    embedOnPaste: true,
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (urlObj && /\/@[^/]+\/[^/]+/.test(urlObj.pathname)) {
        urlObj.searchParams.set('embed', 'true')
        return urlObj.href
      }

      return undefined
    },
  },
  {
    type: 'felt',
    hostnames: ['felt.com'],
    width: 720,
    height: 500,
    embedOnPaste: true,
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (urlObj && /^\/map\//.test(urlObj.pathname)) {
        return `${urlObj.origin}/embed${urlObj.pathname}`
      }

      return undefined
    },
  },
  {
    type: 'val_town',
    hostnames: ['val.town'],
    width: 720,
    height: 500,
    minWidth: 260,
    minHeight: 100,
    embedOnPaste: true,
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      const matches = urlObj?.pathname.match(/\/v\/(.+)\/?/)
      return matches ? `https://www.val.town/embed/${matches[1]}` : undefined
    },
  },
  {
    type: 'observable',
    hostnames: ['observablehq.com'],
    width: 720,
    height: 500,
    embedOnPaste: true,
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (!urlObj) return undefined

      if (/^\/@[^/]+\/[^/]+\/?$/.test(urlObj.pathname)) {
        return `${urlObj.origin}/embed${urlObj.pathname}?cell=*`
      }

      if (/^\/d\/[^/]+\/?$/.test(urlObj.pathname)) {
        return `${urlObj.origin}/embed${urlObj.pathname.replace(/^\/d/, '')}?cell=*`
      }

      return undefined
    },
  },
  {
    type: 'desmos',
    hostnames: ['desmos.com'],
    width: 700,
    height: 450,
    embedOnPaste: true,
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (
        urlObj &&
        urlObj.hostname === 'www.desmos.com' &&
        /^\/calculator\/[^/]+\/?$/.test(urlObj.pathname) &&
        urlObj.search === '' &&
        urlObj.hash === ''
      ) {
        return `${url}?embed`
      }

      return undefined
    },
  },
  {
    type: 'google_calendar',
    hostnames: ['calendar.google.*'],
    width: 720,
    height: 500,
    minWidth: 460,
    minHeight: 360,
    embedOnPaste: true,
    sandboxPermissions: [
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-same-origin',
      'allow-scripts',
    ],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      const cid = urlObj?.searchParams.get('cid')
      if (urlObj?.pathname.match(/\/calendar\/u\/0/) && cid) {
        urlObj.pathname = '/calendar/embed'
        urlObj.search = ''
        urlObj.searchParams.set('src', cid)
        return urlObj.href
      }

      return undefined
    },
  },
  {
    type: 'google_docs',
    hostnames: ['docs.google.*'],
    width: 720,
    height: 500,
    minWidth: 460,
    minHeight: 360,
    embedOnPaste: true,
    sandboxPermissions: [
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-same-origin',
      'allow-scripts',
    ],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (urlObj?.pathname.match(/^\/document\/d\/[^/]+\/(edit|view|preview)\/?$/)) {
        return url
      }

      return undefined
    },
  },
  {
    type: 'google_sheets',
    hostnames: ['docs.google.*'],
    width: 720,
    height: 500,
    minWidth: 460,
    minHeight: 360,
    embedOnPaste: true,
    sandboxPermissions: [
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-same-origin',
      'allow-scripts',
    ],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (urlObj?.pathname.match(/^\/spreadsheets\/d\/[^/]+\/(edit|view|preview|htmlview)\/?$/)) {
        return url
      }

      return undefined
    },
  },
  {
    type: 'google_forms',
    hostnames: ['docs.google.*', 'forms.gle'],
    width: 720,
    height: 640,
    minWidth: 460,
    minHeight: 480,
    embedOnPaste: true,
    sandboxPermissions: [
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-same-origin',
      'allow-scripts',
    ],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (!urlObj) return undefined

      if (urlObj.hostname === 'forms.gle') {
        return url
      }

      if (
        urlObj.pathname.match(/^\/forms\/d\/e\/[^/]+\/(viewform|prefillview|formResponse)\/?$/) ||
        urlObj.pathname.match(/^\/forms\/u\/\d+\/d\/e\/[^/]+\/(viewform|prefillview|formResponse)\/?$/)
      ) {
        return url
      }

      return undefined
    },
  },
  {
    type: 'google_drawings',
    hostnames: ['docs.google.*'],
    width: 720,
    height: 500,
    minWidth: 460,
    minHeight: 360,
    embedOnPaste: true,
    sandboxPermissions: [
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-same-origin',
      'allow-scripts',
    ],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (urlObj?.pathname.match(/^\/drawings\/d\/[^/]+\/(edit|view|preview)\/?$/)) {
        return url
      }

      return undefined
    },
  },
  {
    type: 'loom',
    hostnames: ['loom.com'],
    width: 800,
    height: 450,
    isAspectRatioLocked: true,
    embedOnPaste: true,
    sandboxPermissions: [
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-presentation',
      'allow-same-origin',
      'allow-scripts',
    ],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (!urlObj) return undefined

      const shareMatch = urlObj.pathname.match(/^\/share\/([a-z0-9]+)\/?$/i)
      if (shareMatch) {
        return `https://www.loom.com/embed/${shareMatch[1]}`
      }

      if (urlObj.pathname.match(/^\/embed\/([a-z0-9]+)\/?$/i)) {
        return url
      }

      return undefined
    },
  },
  {
    type: 'miro',
    hostnames: ['miro.com'],
    width: 768,
    height: 432,
    isAspectRatioLocked: true,
    embedOnPaste: true,
    sandboxPermissions: [
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-presentation',
      'allow-same-origin',
      'allow-scripts',
    ],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (!urlObj) return undefined

      const boardMatch = urlObj.pathname.match(/^\/app\/board\/([^/]+)\/?$/)
      if (boardMatch) {
        return `${urlObj.origin}/app/live-embed/${boardMatch[1]}/${urlObj.search}${urlObj.hash}`
      }

      if (urlObj.pathname.match(/^\/app\/live-embed\/([^/]+)\/?$/)) {
        return url
      }

      return undefined
    },
  },
  {
    type: 'google_slides',
    hostnames: ['docs.google.*'],
    width: 720,
    height: 500,
    minWidth: 460,
    minHeight: 360,
    embedOnPaste: true,
    sandboxPermissions: [
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-same-origin',
      'allow-scripts',
    ],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (urlObj?.pathname.match(/^\/presentation/) && urlObj.pathname.match(/\/pub\/?$/)) {
        urlObj.pathname = urlObj.pathname.replace(/\/pub$/, '/embed')
        urlObj.search = ''
        return urlObj.href
      }

      return undefined
    },
  },
  {
    type: 'google_maps',
    hostnames: ['google.*'],
    width: 720,
    height: 500,
    embedOnPaste: true,
    sandboxPermissions: ['allow-forms', 'allow-popups', 'allow-presentation', 'allow-same-origin', 'allow-scripts'],
    toEmbedUrl: (url) => {
      return url.includes('/maps/embed?') ? url : undefined
    },
  },
  {
    type: 'github_gist',
    hostnames: ['gist.github.com'],
    width: 720,
    height: 500,
    embedOnPaste: true,
    sandboxPermissions: ['allow-popups', 'allow-scripts'],
    toEmbedUrl: (url) => {
      const urlObj = buildUrl(url)
      if (urlObj && /\/([^/]+)\/([0-9a-f]+)$/.test(urlObj.pathname)) {
        return url
      }

      return undefined
    },
    toSrcDoc: (url) => {
      const urlObj = buildUrl(url)
      const gistId = urlObj?.pathname.split('/').filter(Boolean).pop()
      if (!gistId || !/^[0-9a-f]+$/i.test(gistId)) {
        return undefined
      }

      return gistSrcDoc(gistId)
    },
  },
] as const

export const resolveEmbed = (url: string): ResolvedEmbed | undefined => {
  const urlObj = buildUrl(url)
  if (!urlObj || !ALLOWED_EXTERNAL_PROTOCOLS.has(urlObj.protocol)) return undefined

  for (const definition of EMBED_DEFINITIONS) {
    if (!matchesDefinitionHost(definition, urlObj)) {
      continue
    }

    const srcDoc = definition.toSrcDoc?.(url)
    if (srcDoc) {
      return {
        definition,
        url,
        renderMode: 'srcDoc',
        srcDoc,
      }
    }

    const embedUrl = definition.toEmbedUrl(url)
    if (embedUrl) {
      return {
        definition,
        url,
        renderMode: 'src',
        embedUrl,
      }
    }
  }

  return undefined
}

export const getAutoEmbed = (url: string) => {
  const resolved = resolveEmbed(url)
  if (!resolved || resolved.definition.embedOnPaste === false) {
    return undefined
  }

  return resolved
}

export const getEmbedSandbox = (embed?: ResolvedEmbed) => {
  return joinPermissions(embed?.definition.sandboxPermissions ?? DEFAULT_SANDBOX_PERMISSIONS)
}

export const getDefaultSandbox = () => joinPermissions(DEFAULT_SANDBOX_PERMISSIONS)
