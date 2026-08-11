import ReactMarkdown from 'react-markdown'
import { articleMarkdown } from '@/content/main-page/content'

export function ArticleMarkdown() {
  return <ReactMarkdown>{articleMarkdown}</ReactMarkdown>
}
