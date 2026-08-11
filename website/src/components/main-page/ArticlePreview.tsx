import { ArticleMarkdown } from '@/components/main-page/ArticleMarkdown'
import { ArticleReader } from '@/components/main-page/ArticleReader'
import { articleMarkdown } from '@/content/main-page/content'

const articleLineCount = articleMarkdown.trim().split('\n').length

export function ArticlePreview() {
  return (
    <ArticleReader lineCount={articleLineCount}>
      <ArticleMarkdown />
    </ArticleReader>
  )
}
