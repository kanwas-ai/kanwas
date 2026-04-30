import type { ToolkitCategory, ToolkitStatus } from '@/api/connections'

export const POPULAR_CATEGORY = {
  slug: 'popular',
  name: 'Popular',
} as const

const POPULAR_TARGET_MIN = 15
const POPULAR_TARGET_MAX = 20

const POPULAR_MIXED_TOOLKIT_ORDER = [
  'slack',
  'notion',
  'hubspot',
  'jira',
  'amplitude',
  'github',
  'zendesk',
  'figma',
  'posthog',
  'salesforce',
  'linear',
  'googlesheets',
  'intercom',
  'miro',
  'googledrive',
  'trello',
  'zoom',
  'airtable',
  'confluence',
  'calendly',
  'googledocs',
  'gitlab',
  'clickup',
  'monday',
  'asana',
  'productboard',
] as const

const POPULAR_ANALYTICS_TOOLKITS = ['amplitude', 'posthog'] as const

const PM_CATEGORY_HINTS = [
  /product|project|task|roadmap|planning|issue|devops/,
  /analytics|metrics|insights|tracking|bi|data/,
  /crm|sales|support|customer/,
  /collaboration|communication|chat|messaging|meeting/,
  /docs|notes|wiki|knowledge|office|spreadsheet/,
]

const PM_CATEGORY_PRIORITY_RULES = [
  /product|project|task|roadmap|planning|issue|kanban|scrum|agile|work[-\s]?management/,
  /analytics|metrics|insights|tracking|business[-\s]?intelligence|\bbi\b|dashboards?|data[-\s]?visualization/,
  /\bcrm\b|customer[-\s]?relationship|customer[-\s]?support|support|feedback|survey|ticket|sales|pipeline/,
  /collaboration|communication|chat|messaging|meeting|team[-\s]?chat|video|voice|calendar|scheduling|appointments|booking/,
  /docs?|document|knowledge|wiki|notes|writing|office|productivity|spreadsheets?/,
  /design|prototype|ux|ui|wireframe|creative/,
  /automation|workflow|orchestration|integration|connectors?|rpa/,
]

interface CategoryVisualRule {
  pattern: RegExp
  iconIds: readonly string[]
}

const CATEGORY_VISUAL_RULES: CategoryVisualRule[] = [
  {
    pattern: /\bpopular\b/,
    iconIds: ['fire', 'star', 'rocket', 'thumbs-up'],
  },
  {
    pattern:
      /analytics|product[-\s]?analytics|metrics|insights|tracking|business[-\s]?intelligence|\bbi\b|data[-\s]?visualization|event[-\s]?analytics|dashboards?/,
    iconIds: ['chart-simple', 'chart-line', 'chart-bar', 'chart-pie', 'square-poll-vertical', 'gauge'],
  },
  {
    pattern: /\bcrm\b|customer[-\s]?relationship|sales|pipeline|lead[-\s]?management|revenue|contact[-\s]?management/,
    iconIds: ['users', 'address-book', 'id-card', 'handshake', 'user-tag'],
  },
  {
    pattern: /marketing|advertising|campaign|seo|social[-\s]?media|growth|brand|ads?|conversion|drip[-\s]?emails?/,
    iconIds: ['bullhorn', 'rectangle-ad', 'bullseye', 'arrow-up-right-dots', 'arrow-trend-up'],
  },
  {
    pattern:
      /project|task|issue|roadmap|planning|kanban|scrum|management|work[-\s]?management|agile|time[-\s]?tracking/,
    iconIds: ['chart-gantt', 'list-check', 'bars-progress', 'timeline', 'diagram-project', 'clipboard-list'],
  },
  {
    pattern: /collaboration|communication|chat|messaging|meeting|video|voice|team[-\s]?chat|notifications?|webinars?/,
    iconIds: ['comments', 'message', 'comment-dots', 'people-arrows', 'calendar-check'],
  },
  {
    pattern:
      /developer|devops|engineering|source[-\s]?control|ci[-\s]?cd|code|git|api|programming|webhooks?|version[-\s]?control|app[-\s]?builder|web[-\s]?scraping/,
    iconIds: ['code', 'terminal', 'code-branch', 'server', 'microchip', 'laptop-code'],
  },
  {
    pattern: /design|prototype|ux|ui|creative|wireframe|graphics|images?/,
    iconIds: ['palette', 'pen-ruler', 'bezier-curve', 'crop-simple', 'wand-magic-sparkles'],
  },
  {
    pattern:
      /docs?|document|documentation|knowledge|wiki|notes|writing|editor|knowledge[-\s]?base|office|productivity|spreadsheets?/,
    iconIds: ['file-lines', 'book-open', 'note-sticky', 'book-bookmark', 'file-word'],
  },
  {
    pattern:
      /storage|files?|cloud|drive|backup|filesystem|file[-\s]?management|asset[-\s]?management|content[-\s]?files?/,
    iconIds: ['hard-drive', 'folder-open', 'database', 'box-archive', 'cloud'],
  },
  {
    pattern: /support|helpdesk|ticket|customer[-\s]?support|customer[-\s]?service|service[-\s]?desk|incident/,
    iconIds: ['headset', 'life-ring', 'ticket', 'circle-question', 'comments'],
  },
  {
    pattern: /customer[-\s]?appreciation|loyalty/,
    iconIds: ['award', 'gift', 'trophy', 'medal', 'star'],
  },
  {
    pattern: /fundraising|donations?|charity|nonprofit/,
    iconIds: ['hand-holding-heart', 'hands-holding', 'circle-dollar-to-slot', 'heart', 'seedling'],
  },
  {
    pattern:
      /finance|billing|payments?|accounting|invoice|tax(?:es)?|bookkeeping|expense|banking|proposal[-\s]?invoice/,
    iconIds: ['file-invoice-dollar', 'receipt', 'money-check-dollar', 'credit-card', 'calculator'],
  },
  {
    pattern: /e[-\s]?commerce|commerce|shop|store|retail|marketplace|order[-\s]?management/,
    iconIds: ['cart-shopping', 'shop', 'bag-shopping', 'store', 'cash-register'],
  },
  {
    pattern: /calendar|scheduling|appointments|booking|events?|availability/,
    iconIds: ['calendar-check', 'calendar-days', 'calendar-day', 'calendar-week', 'clock'],
  },
  {
    pattern: /automation|workflow|orchestration|integration|connectors?|rpa/,
    iconIds: ['diagram-project', 'gears', 'code-merge', 'chart-diagram', 'arrows-rotate'],
  },
  {
    pattern:
      /\bai\b|llm|machine[-\s]?learning|artificial[-\s]?intelligence|assistant|chatbot|agent|ai[-\s]?models?|ai[-\s]?content[-\s]?generation|ai[-\s]?meeting[-\s]?assistants?|ai[-\s]?sales[-\s]?tools?|ai[-\s]?safety/,
    iconIds: ['robot', 'microchip', 'brain', 'square-binary', 'wand-magic-sparkles'],
  },
  {
    pattern: /database|databases|\bdb\b|warehouse|data[-\s]?platform|etl|query/,
    iconIds: ['database', 'warehouse', 'table', 'server', 'hard-drive'],
  },
  {
    pattern: /email|emails|inbox|mail|newsletter|transactional[-\s]?email/,
    iconIds: ['inbox', 'envelope', 'envelope-open-text', 'paper-plane', 'envelopes-bulk'],
  },
  {
    pattern: /forms?|survey|poll|feedback/,
    iconIds: ['square-poll-horizontal', 'clipboard-list', 'file-contract', 'list-ul', 'square-pen'],
  },
  {
    pattern: /security|identity|auth|iam|compliance|sso|credentials?|verifiable|decentralized[-\s]?identity|blockchain/,
    iconIds: ['user-lock', 'shield-halved', 'lock', 'key', 'fingerprint'],
  },
  {
    pattern: /human[-\s]?resources|hr|recruiting|talent|people/,
    iconIds: ['user-tie', 'users-gear', 'user-plus', 'clipboard-user', 'users-line'],
  },
  {
    pattern: /phone|sms|call[-\s]?tracking/,
    iconIds: ['phone', 'comment-sms', 'square-phone', 'phone-volume', 'microphone-lines'],
  },
  {
    pattern: /server[-\s]?monitoring|monitoring|it[-\s]?operations|observability/,
    iconIds: ['gauge', 'server', 'triangle-exclamation', 'circle-exclamation', 'tachograph-digital'],
  },
  {
    pattern: /signatures?/,
    iconIds: ['file-signature', 'signature', 'file-contract', 'pen-to-square', 'file-lines'],
  },
  {
    pattern: /transcription|transcribe|audio[-\s]?to[-\s]?text/,
    iconIds: ['closed-captioning', 'microphone-lines', 'microphone', 'comment-dots', 'file-lines'],
  },
  {
    pattern: /education|online[-\s]?courses?|learning|lms/,
    iconIds: ['graduation-cap', 'chalkboard-user', 'book-open-reader', 'school', 'book-open'],
  },
  {
    pattern: /url[-\s]?shortener|short[-\s]?links?/,
    iconIds: ['link', 'share-nodes', 'link-slash', 'square-up-right', 'paperclip'],
  },
  {
    pattern: /internet[-\s]?of[-\s]?things|iot/,
    iconIds: ['microchip', 'tower-cell', 'wifi', 'tower-broadcast', 'satellite'],
  },
  {
    pattern: /gaming|games?/,
    iconIds: ['gamepad', 'dice', 'chess-knight', 'trophy', 'puzzle-piece'],
  },
  {
    pattern: /reviews?|ratings?/,
    iconIds: ['star', 'star-half-stroke', 'thumbs-up', 'comments', 'award'],
  },
  {
    pattern: /fitness|wellness|health/,
    iconIds: ['heart-pulse', 'dumbbell', 'person-running', 'weight-scale', 'bicycle'],
  },
  {
    pattern: /bookmark|bookmarks?/,
    iconIds: ['bookmark', 'book-bookmark', 'thumbtack', 'flag', 'book'],
  },
  {
    pattern: /maps|location|geospatial|travel/,
    iconIds: ['map-location-dot', 'location-dot', 'route', 'map', 'location-crosshairs'],
  },
  {
    pattern: /news|media|content|publishing|lifestyle|entertainment/,
    iconIds: ['newspaper', 'rss', 'square-rss', 'radio', 'envelope-open-text'],
  },
]

const CATEGORY_ICON_COLOR_POOL = [
  'text-[#2e609e]',
  'text-[#3a6faf]',
  'text-[#4a82bf]',
  'text-[#2f7eaa]',
  'text-[#5a8fc6]',
  'text-[#df7b57]',
  'text-[#e18a68]',
  'text-[#cb694a]',
  'text-[#d88745]',
  'text-[#c85e5e]',
  'text-[#50be37]',
  'text-[#62c84b]',
  'text-[#43ad33]',
  'text-[#68b63d]',
  'text-[#4faa73]',
  'text-[#e8a300]',
  'text-[#f0b42f]',
  'text-[#d59200]',
  'text-[#c68027]',
  'text-[#b49a33]',
] as const

const DEFAULT_CATEGORY_ICON_IDS = ['shapes', 'folder', 'box', 'sitemap', 'compass', 'layer-group'] as const

const GLOBAL_CATEGORY_ICON_IDS = Array.from(
  new Set([...DEFAULT_CATEGORY_ICON_IDS, ...CATEGORY_VISUAL_RULES.flatMap((rule) => rule.iconIds)])
)

const DEFAULT_CATEGORY_VISUAL = {
  iconClassName: 'fa-solid fa-shapes',
  iconColorClassName: 'text-foreground-muted/75',
} as const

const CATEGORY_UPPERCASE_TERMS = new Set([
  'ai',
  'api',
  'bi',
  'crm',
  'etl',
  'hr',
  'iam',
  'it',
  'llm',
  'rpa',
  'seo',
  'sms',
  'sso',
  'ui',
  'url',
  'ux',
])

const CATEGORY_LOWERCASE_TERMS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

type CategoryLabelStyle = 'title' | 'upper'

type PopularBucket =
  | 'project'
  | 'analytics'
  | 'crm'
  | 'collaboration'
  | 'developer'
  | 'design'
  | 'docs'
  | 'storage'
  | 'support'
  | 'calendar'
  | 'automation'
  | 'marketing'
  | 'finance'
  | 'ecommerce'
  | 'ai'
  | 'news'
  | 'forms'
  | 'hr'
  | 'security'
  | 'other'

const POPULAR_BUCKET_ORDER: PopularBucket[] = [
  'project',
  'analytics',
  'crm',
  'collaboration',
  'developer',
  'design',
  'docs',
  'storage',
  'support',
  'calendar',
  'automation',
  'marketing',
  'finance',
  'ecommerce',
  'ai',
  'news',
  'forms',
  'hr',
  'security',
  'other',
]

const POPULAR_BUCKET_RULES: Array<{ bucket: PopularBucket; pattern: RegExp }> = [
  { bucket: 'project', pattern: /project|task|issue|roadmap|planning|kanban|scrum|management/ },
  { bucket: 'analytics', pattern: /analytics|metrics|insights|tracking|bi|data-visualization/ },
  { bucket: 'crm', pattern: /crm|sales|pipeline|customer-relationship/ },
  { bucket: 'collaboration', pattern: /collaboration|communication|chat|messaging|meeting|video/ },
  { bucket: 'developer', pattern: /developer|devops|engineering|source-control|ci-cd|code|git|api/ },
  { bucket: 'design', pattern: /design|prototype|ux|ui|creative/ },
  { bucket: 'docs', pattern: /docs|document|knowledge|wiki|notes|writing|office|productivity/ },
  { bucket: 'storage', pattern: /storage|files|cloud|drive|backup|filesystem/ },
  { bucket: 'support', pattern: /support|helpdesk|ticket|customer-support/ },
  { bucket: 'calendar', pattern: /calendar|scheduling|appointments|booking/ },
  { bucket: 'automation', pattern: /automation|workflow|orchestration|integration/ },
  { bucket: 'marketing', pattern: /marketing|advertising|campaign|seo|social-media|growth/ },
  { bucket: 'finance', pattern: /finance|billing|payments|accounting|invoice|tax/ },
  { bucket: 'ecommerce', pattern: /ecommerce|commerce|shop|store|retail/ },
  { bucket: 'ai', pattern: /ai|llm|machine-learning|artificial-intelligence|assistant|agent/ },
  { bucket: 'news', pattern: /news|media|content|publishing/ },
  { bucket: 'forms', pattern: /forms|survey|poll|feedback/ },
  { bucket: 'hr', pattern: /human-resources|hr|recruiting|talent|people/ },
  { bucket: 'security', pattern: /security|identity|auth|iam|compliance|sso/ },
]

export function normalizeToolkitKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function formatCategoryToken(token: string, keepLowercaseConnector: boolean): string {
  const parts = token.split(/([/&-])/)

  return parts
    .map((part, index) => {
      if (!part || part === '/' || part === '&' || part === '-') {
        return part
      }

      const lower = part.toLowerCase()

      if (CATEGORY_UPPERCASE_TERMS.has(lower)) {
        return lower.toUpperCase()
      }

      if (index === 0 && keepLowercaseConnector && CATEGORY_LOWERCASE_TERMS.has(lower)) {
        return lower
      }

      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
    })
    .join('')
}

export function formatCategoryLabel(label: string, style: CategoryLabelStyle = 'title'): string {
  const normalizedLabel = label.trim().replace(/\s+/g, ' ')
  if (!normalizedLabel) {
    return ''
  }

  const titleLabel = normalizedLabel
    .split(' ')
    .map((token, index) => formatCategoryToken(token, index > 0))
    .join(' ')

  if (style === 'upper') {
    return titleLabel.toUpperCase()
  }

  return titleLabel
}

function categoryLookupKey(category: Pick<ToolkitCategory, 'slug' | 'name'>): string {
  const slug = category.slug?.trim().toLowerCase() ?? ''
  const name = category.name?.trim().toLowerCase() ?? ''
  return `${slug} ${name}`.trim()
}

function categoryVisualKey(category: Pick<ToolkitCategory, 'slug' | 'name'>): string {
  const slug = category.slug?.trim().toLowerCase()
  if (slug) {
    return slug
  }

  return category.name?.trim().toLowerCase() ?? ''
}

function hashString(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function getCategoryIconIds(lookup: string): readonly string[] {
  for (const rule of CATEGORY_VISUAL_RULES) {
    if (rule.pattern.test(lookup)) {
      return rule.iconIds
    }
  }

  return DEFAULT_CATEGORY_ICON_IDS
}

function pickUnusedIconId(lookup: string, usedIconIds: Set<string>): string {
  const preferredIconIds = getCategoryIconIds(lookup)
  const preferredStartIndex = hashString(lookup) % preferredIconIds.length

  for (let index = 0; index < preferredIconIds.length; index += 1) {
    const candidate = preferredIconIds[(preferredStartIndex + index) % preferredIconIds.length]
    if (candidate && !usedIconIds.has(candidate)) {
      return candidate
    }
  }

  const fallbackStartIndex = hashString(`${lookup}:fallback`) % GLOBAL_CATEGORY_ICON_IDS.length

  for (let index = 0; index < GLOBAL_CATEGORY_ICON_IDS.length; index += 1) {
    const candidate = GLOBAL_CATEGORY_ICON_IDS[(fallbackStartIndex + index) % GLOBAL_CATEGORY_ICON_IDS.length]
    if (candidate && !usedIconIds.has(candidate)) {
      return candidate
    }
  }

  return preferredIconIds[preferredStartIndex] ?? DEFAULT_CATEGORY_ICON_IDS[0] ?? 'shapes'
}

function pickIconColorClass(lookup: string, colorUsage: Map<string, number>): string {
  const preferredStartIndex = hashString(`${lookup}:color`) % CATEGORY_ICON_COLOR_POOL.length

  let selectedColor = CATEGORY_ICON_COLOR_POOL[preferredStartIndex] ?? DEFAULT_CATEGORY_VISUAL.iconColorClassName
  let selectedColorUsage = colorUsage.get(selectedColor) ?? 0

  for (let index = 1; index < CATEGORY_ICON_COLOR_POOL.length; index += 1) {
    const candidate = CATEGORY_ICON_COLOR_POOL[(preferredStartIndex + index) % CATEGORY_ICON_COLOR_POOL.length]
    if (!candidate) {
      continue
    }

    const usage = colorUsage.get(candidate) ?? 0
    if (usage < selectedColorUsage) {
      selectedColor = candidate
      selectedColorUsage = usage

      if (usage === 0) {
        break
      }
    }
  }

  colorUsage.set(selectedColor, selectedColorUsage + 1)
  return selectedColor
}

type CategoryVisual = {
  iconClassName: string
  iconColorClassName: string
}

export function getCategoryVisualMap(
  categories: Array<Pick<ToolkitCategory, 'slug' | 'name'>>
): Map<string, CategoryVisual> {
  const visualMap = new Map<string, CategoryVisual>()
  const usedIconIds = new Set<string>()
  const colorUsage = new Map<string, number>()

  for (const category of categories) {
    const key = categoryVisualKey(category)
    if (!key || visualMap.has(key)) {
      continue
    }

    const lookup = categoryLookupKey(category)
    const iconId = pickUnusedIconId(lookup, usedIconIds)
    usedIconIds.add(iconId)

    visualMap.set(key, {
      iconClassName: `fa-solid fa-${iconId}`,
      iconColorClassName: pickIconColorClass(lookup, colorUsage),
    })
  }

  return visualMap
}

function getConnectionCategoryLookup(connection: ToolkitStatus): string {
  return (connection.categories ?? []).map((category) => categoryLookupKey(category)).join(' ')
}

export function getCategoryVisual(category: Pick<ToolkitCategory, 'slug' | 'name'>): {
  iconClassName: string
  iconColorClassName: string
} {
  const key = categoryVisualKey(category)
  if (!key) {
    return DEFAULT_CATEGORY_VISUAL
  }

  return getCategoryVisualMap([category]).get(key) ?? DEFAULT_CATEGORY_VISUAL
}

export function getPmCategoryPriority(category: Pick<ToolkitCategory, 'slug' | 'name'>): number {
  const lookup = categoryLookupKey(category)

  for (let index = 0; index < PM_CATEGORY_PRIORITY_RULES.length; index += 1) {
    if (PM_CATEGORY_PRIORITY_RULES[index]?.test(lookup)) {
      return index
    }
  }

  return Number.MAX_SAFE_INTEGER
}

function isPmCategory(connection: ToolkitStatus): boolean {
  const lookup = getConnectionCategoryLookup(connection)
  return PM_CATEGORY_HINTS.some((pattern) => pattern.test(lookup))
}

function getPopularBucket(connection: ToolkitStatus): PopularBucket {
  const lookup = getConnectionCategoryLookup(connection)

  for (const rule of POPULAR_BUCKET_RULES) {
    if (rule.pattern.test(lookup)) {
      return rule.bucket
    }
  }

  return 'other'
}

function pushPopularToolkitKey(
  toolkit: string,
  availableByKey: Map<string, ToolkitStatus>,
  selectedOrder: string[],
  selectedSet: Set<string>
): void {
  if (selectedOrder.length >= POPULAR_TARGET_MAX) {
    return
  }

  const key = normalizeToolkitKey(toolkit)
  if (!key || selectedSet.has(key) || !availableByKey.has(key)) {
    return
  }

  selectedSet.add(key)
  selectedOrder.push(key)
}

function appendDiverseCandidates(
  candidates: Array<[string, ToolkitStatus]>,
  targetSize: number,
  selectedOrder: string[],
  selectedSet: Set<string>
): void {
  if (selectedOrder.length >= targetSize || selectedOrder.length >= POPULAR_TARGET_MAX) {
    return
  }

  const bucketedCandidates = new Map<PopularBucket, string[]>()

  for (const [key, connection] of candidates) {
    const bucket = getPopularBucket(connection)
    const existingBucket = bucketedCandidates.get(bucket)

    if (existingBucket) {
      existingBucket.push(key)
    } else {
      bucketedCandidates.set(bucket, [key])
    }
  }

  let pickedInRound = true

  while (pickedInRound && selectedOrder.length < targetSize && selectedOrder.length < POPULAR_TARGET_MAX) {
    pickedInRound = false

    for (const bucket of POPULAR_BUCKET_ORDER) {
      const queue = bucketedCandidates.get(bucket)
      if (!queue || queue.length === 0) {
        continue
      }

      const nextKey = queue.shift()
      if (!nextKey || selectedSet.has(nextKey)) {
        continue
      }

      selectedSet.add(nextKey)
      selectedOrder.push(nextKey)
      pickedInRound = true

      if (selectedOrder.length >= targetSize || selectedOrder.length >= POPULAR_TARGET_MAX) {
        break
      }
    }
  }
}

export function getPopularToolkitOrder(connections: ToolkitStatus[]): string[] {
  const availableByKey = new Map<string, ToolkitStatus>()

  for (const connection of connections) {
    const key = normalizeToolkitKey(connection.toolkit)
    if (key && !availableByKey.has(key)) {
      availableByKey.set(key, connection)
    }
  }

  const selectedOrder: string[] = []
  const selectedSet = new Set<string>()

  for (const toolkit of POPULAR_MIXED_TOOLKIT_ORDER) {
    pushPopularToolkitKey(toolkit, availableByKey, selectedOrder, selectedSet)
  }

  for (const toolkit of POPULAR_ANALYTICS_TOOLKITS) {
    pushPopularToolkitKey(toolkit, availableByKey, selectedOrder, selectedSet)
  }

  if (selectedOrder.length < POPULAR_TARGET_MIN) {
    const pmCandidates = [...availableByKey.entries()].filter(
      ([key, connection]) => !selectedSet.has(key) && isPmCategory(connection)
    )
    appendDiverseCandidates(pmCandidates, POPULAR_TARGET_MIN, selectedOrder, selectedSet)
  }

  if (selectedOrder.length < POPULAR_TARGET_MIN) {
    const remainingCandidates = [...availableByKey.entries()].filter(([key]) => !selectedSet.has(key))
    appendDiverseCandidates(remainingCandidates, POPULAR_TARGET_MIN, selectedOrder, selectedSet)
  }

  return selectedOrder
}

export function isToolkitPopular(toolkit: string, popularToolkitKeys: Set<string>): boolean {
  return popularToolkitKeys.has(normalizeToolkitKey(toolkit))
}
