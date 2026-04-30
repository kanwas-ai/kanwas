import { useMemo } from 'react'
import { Streamdown, type StreamdownProps } from 'streamdown'
import { DEFAULT_REMARK_PLUGIN_LIST, type MarkdownComponents } from './chatMarkdownShared'

const BASE_CLASS_NAME = 'space-y-0'
const DEFAULT_ANIMATED = { animation: 'fadeIn', duration: 120, easing: 'ease-out' } as const
const DEFAULT_LINK_SAFETY = { enabled: false } as const
const DEFAULT_REMEND = { linkMode: 'text-only' } as const

interface ChatMarkdownProps {
  markdown: string
  streaming?: boolean
  className?: string
  components?: MarkdownComponents
  remarkPlugins?: StreamdownProps['remarkPlugins']
}

export function ChatMarkdown({ markdown, streaming = false, className, components, remarkPlugins }: ChatMarkdownProps) {
  const mergedRemarkPlugins = useMemo(
    () => (remarkPlugins ? [...DEFAULT_REMARK_PLUGIN_LIST, ...remarkPlugins] : DEFAULT_REMARK_PLUGIN_LIST),
    [remarkPlugins]
  )

  return (
    <Streamdown
      animated={DEFAULT_ANIMATED}
      className={className ? `${BASE_CLASS_NAME} ${className}` : BASE_CLASS_NAME}
      components={components}
      controls={false}
      isAnimating={streaming}
      lineNumbers={false}
      linkSafety={DEFAULT_LINK_SAFETY}
      mode={streaming ? 'streaming' : 'static'}
      remend={DEFAULT_REMEND}
      remarkPlugins={mergedRemarkPlugins}
      skipHtml
    >
      {markdown}
    </Streamdown>
  )
}
