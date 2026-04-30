import type { ExecutionCompletedItem } from 'backend/agent'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ExecutionCompletedProps {
  item: ExecutionCompletedItem
}

export function ExecutionCompleted({ item }: ExecutionCompletedProps) {
  return (
    <div
      className="text-foreground text-sm font-medium max-w-none [&_p]:mb-3 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:my-1 [&_h1]:mb-3 [&_h2]:mb-3 [&_h3]:mb-3 [&_h4]:mb-3 [&_code]:bg-canvas [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-foreground [&_pre]:bg-canvas [&_pre]:border [&_pre]:border-outline [&_pre]:p-3 [&_pre]:rounded [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_th]:border [&_th]:border-outline [&_th]:bg-canvas [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-outline [&_td]:px-3 [&_td]:py-2"
      style={{ lineHeight: '24px' }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="chat-link">
              {children}
            </a>
          ),
        }}
      >
        {item.summary}
      </ReactMarkdown>
    </div>
  )
}
