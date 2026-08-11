import { describe, expect, it } from 'vitest'
import {
  binaryStorageBasename,
  contentExtensionForType,
  contentFileMatchesName,
  matchBinaryFile,
  matchNodeFile,
  nodeFileClass,
  stripContentExtension,
} from '../src/name-match.js'

describe('name-match', () => {
  it('maps node types to on-disk classes and extensions', () => {
    expect(nodeFileClass('blockNote')).toBe('markdown')
    expect(nodeFileClass('stickyNote')).toBe('sticky')
    expect(nodeFileClass('text')).toBe('text')
    expect(nodeFileClass('link')).toBe('url')
    expect(nodeFileClass('image')).toBe('binary')
    expect(nodeFileClass('file')).toBe('binary')
    expect(nodeFileClass('audio')).toBe('binary')
    expect(nodeFileClass('canvas')).toBe('none')

    expect(contentExtensionForType('blockNote')).toBe('.md')
    expect(contentExtensionForType('stickyNote')).toBe('.sticky.yaml')
    expect(contentExtensionForType('text')).toBe('.text.yaml')
    expect(contentExtensionForType('link')).toBe('.url.yaml')
    expect(contentExtensionForType('image')).toBeNull()
  })

  it('strips content extensions (compound and case-insensitive)', () => {
    expect(stripContentExtension('note.md', '.md')).toBe('note')
    expect(stripContentExtension('note.sticky.yaml', '.sticky.yaml')).toBe('note')
    expect(stripContentExtension('README.MD', '.md')).toBe('README')
    expect(stripContentExtension('note.md', '.sticky.yaml')).toBeNull()
    // a bare .yaml must NOT be treated as a .sticky.yaml stem-strip target
    expect(stripContentExtension('metadata.yaml', '.sticky.yaml')).toBeNull()
  })

  it('sanitizes BOTH sides when matching a content filename to a node name', () => {
    // The disk-align latent bug: a stored display name that is not already
    // sanitized must still match its sanitized file.
    expect(contentFileMatchesName('new-document.md', '.md', 'New Document')).toBe(true)
    expect(contentFileMatchesName('README.md', '.md', 'README')).toBe(true)
    expect(contentFileMatchesName('readme.md', '.md', 'README')).toBe(true)
    expect(contentFileMatchesName('my-note.md', '.md', 'My  Note')).toBe(true)
    expect(contentFileMatchesName('other.md', '.md', 'New Document')).toBe(false)
  })

  it('matches binary files by storagePath basename (exact then case-insensitive)', () => {
    expect(binaryStorageBasename('media/logo.png')).toBe('logo.png')
    expect(binaryStorageBasename('logo.png')).toBe('logo.png')
    expect(binaryStorageBasename(undefined)).toBeUndefined()
    expect(binaryStorageBasename(123)).toBeUndefined()

    expect(matchBinaryFile('media/logo.png', ['logo.png', 'other.png'])).toBe('logo.png')
    expect(matchBinaryFile('media/Logo.PNG', ['logo.png'])).toBe('logo.png')
    expect(matchBinaryFile('media/missing.png', ['logo.png'])).toBeUndefined()
  })

  it('matchNodeFile resolves the single backing file per node type', () => {
    const files = ['readme.md', 'new-document.md', 'note.sticky.yaml', 'idea.text.yaml', 'ref.url.yaml', 'logo.png']
    expect(matchNodeFile({ type: 'blockNote', name: 'README' }, files)).toBe('readme.md')
    expect(matchNodeFile({ type: 'blockNote', name: 'New Document' }, files)).toBe('new-document.md')
    expect(matchNodeFile({ type: 'stickyNote', name: 'note' }, files)).toBe('note.sticky.yaml')
    expect(matchNodeFile({ type: 'text', name: 'idea' }, files)).toBe('idea.text.yaml')
    expect(matchNodeFile({ type: 'link', name: 'ref' }, files)).toBe('ref.url.yaml')
    expect(matchNodeFile({ type: 'image', name: 'anything', storagePath: 'sub/logo.png' }, files)).toBe('logo.png')
    expect(matchNodeFile({ type: 'canvas', name: 'x' }, files)).toBeUndefined()
    // a blockNote must not accidentally match a .sticky.yaml or .text.yaml
    expect(matchNodeFile({ type: 'blockNote', name: 'note' }, files)).toBeUndefined()
  })
})
