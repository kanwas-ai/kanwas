import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALL_TOOLS } from '@/components/canvas/addNodeToolbar'

type FontAwesomeIconMetadata = {
  aliases?: { names?: string[] }
  familyStylesByLicense?: {
    free?: Array<{ family: string; style: string }>
  }
}

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const metadataPath = path.join(rendererRoot, 'node_modules/@fortawesome/fontawesome-free/metadata/icon-families.json')
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Record<string, FontAwesomeIconMetadata>

const metadataByName = new Map<string, FontAwesomeIconMetadata>()
for (const [name, icon] of Object.entries(metadata)) {
  metadataByName.set(name, icon)
  for (const alias of icon.aliases?.names ?? []) metadataByName.set(alias, icon)
}

function supportsFreeClassicStyle(iconClass: string, style: 'regular' | 'solid'): boolean {
  const icon = metadataByName.get(iconClass.replace(/^fa-/, ''))
  return Boolean(
    icon?.familyStylesByLicense?.free?.some((entry) => entry.family === 'classic' && entry.style === style)
  )
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : []
  })
}

describe('locally bundled Font Awesome icons', () => {
  it('uses Free-compatible styles for the dynamic add-node toolbar', () => {
    for (const tool of ALL_TOOLS) {
      expect(supportsFreeClassicStyle(tool.icon, tool.iconStyle), `${tool.iconStyle} ${tool.icon}`).toBe(true)
    }
  })

  it('uses Free-compatible styles for static renderer icon classes', () => {
    const invalid: string[] = []

    for (const file of sourceFiles(path.join(rendererRoot, 'src'))) {
      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(/fa-(regular|solid)\s+fa-([a-z0-9-]+)/g)) {
        const style = match[1] as 'regular' | 'solid'
        const iconClass = `fa-${match[2]}`
        if (!supportsFreeClassicStyle(iconClass, style)) {
          invalid.push(`${path.relative(rendererRoot, file)}: fa-${style} ${iconClass}`)
        }
      }
    }

    expect(invalid).toEqual([])
  })
})
