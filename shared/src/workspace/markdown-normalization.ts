import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'

type MarkdownNode = {
  type?: string
  spread?: boolean
  children?: MarkdownNode[]
}

function isSimpleTightListItem(node: MarkdownNode): boolean {
  if (node.type !== 'listItem' || !Array.isArray(node.children) || node.children.length === 0) {
    return false
  }

  let sawParagraph = false
  let sawList = false

  for (const child of node.children) {
    if (child.type === 'paragraph') {
      if (sawParagraph || sawList) {
        return false
      }
      sawParagraph = true
      continue
    }

    if (child.type === 'list') {
      sawList = true
      continue
    }

    return false
  }

  return true
}

function tightenSimpleLists(node: MarkdownNode): void {
  for (const child of node.children ?? []) {
    tightenSimpleLists(child)
  }

  if (node.type !== 'list' || !Array.isArray(node.children) || node.children.length === 0) {
    return
  }

  if (!node.children.every(isSimpleTightListItem)) {
    return
  }

  node.spread = false
  for (const child of node.children) {
    child.spread = false
  }
}

export function normalizeBlockNoteMarkdown(markdown: string): string {
  if (!markdown.includes('*') && !markdown.includes('-') && !/[0-9]+\./.test(markdown)) {
    return markdown
  }

  try {
    const file = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(() => (tree: MarkdownNode) => {
        tightenSimpleLists(tree)
      })
      .use(remarkStringify, {
        bullet: '*',
        fences: true,
        listItemIndent: 'one',
      })
      .processSync(markdown)

    return String(file)
  } catch {
    // Keep BlockNote's raw output if the post-pass cannot parse it.
    return markdown
  }
}
