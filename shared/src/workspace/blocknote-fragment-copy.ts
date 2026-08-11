import * as Y from 'yjs'

type XmlNode = Y.XmlElement | Y.XmlText

function withReadableFragment<T>(source: Y.XmlFragment, callback: (readableSource: Y.XmlFragment) => T): T {
  if (source.doc) {
    return callback(source)
  }

  const tempDoc = new Y.Doc()
  const tempMap = tempDoc.getMap<Y.XmlFragment>('blocknote-fragment-copy')
  tempMap.set('source', source)

  const readableSource = tempMap.get('source')
  if (!readableSource) {
    throw new Error('Failed to adopt detached BlockNote fragment for copying')
  }

  return callback(readableSource)
}

function copyXmlText(source: Y.XmlText): Y.XmlText {
  const target = new Y.XmlText()

  for (const [attributeName, attributeValue] of Object.entries(source.getAttributes())) {
    target.setAttribute(attributeName as string, attributeValue)
  }

  let index = 0
  for (const op of source.toDelta()) {
    if (typeof op.insert === 'string') {
      target.insert(index, op.insert, op.attributes ?? {})
      index += op.insert.length
      continue
    }

    target.insertEmbed(index, op.insert as object, op.attributes ?? {})
    index += 1
  }

  return target
}

function copyXmlElement(source: Y.XmlElement): Y.XmlElement {
  const target = new Y.XmlElement<Record<string, any>>(source.nodeName)

  for (const [attributeName, attributeValue] of Object.entries(source.getAttributes())) {
    target.setAttribute(attributeName as string, attributeValue)
  }

  const copiedChildren = source
    .toArray()
    .map((child) => copyBlockNoteXmlNode(child as Y.XmlElement | Y.XmlText | Y.XmlHook))
  if (copiedChildren.length > 0) {
    target.push(copiedChildren)
  }

  return target as Y.XmlElement
}

function copyBlockNoteXmlNode(node: Y.XmlElement | Y.XmlText | Y.XmlHook): XmlNode {
  if (node instanceof Y.XmlElement) {
    return copyXmlElement(node)
  }

  if (node instanceof Y.XmlText) {
    return copyXmlText(node)
  }

  throw new Error(`Unsupported Yjs XML node in BlockNote fragment copy: ${node.constructor.name}`)
}

export function copyBlockNoteFragment(
  source: Y.XmlFragment,
  target: Y.XmlFragment = new Y.XmlFragment()
): Y.XmlFragment {
  return withReadableFragment(source, (readableSource) => {
    if (target.length > 0) {
      target.delete(0, target.length)
    }

    const copiedChildren = readableSource
      .toArray()
      .map((child) => copyBlockNoteXmlNode(child as Y.XmlElement | Y.XmlText | Y.XmlHook))

    if (copiedChildren.length > 0) {
      target.insert(0, copiedChildren)
    }

    return target
  })
}
