'use client'

import { mainPageCopy } from '@/content/main-page/content'
import { FlashOpacityText } from '@/components/ui/FlashOpacityText'

export function ArticleIntro() {
  return (
    <section data-section="article-intro" className="mb-[22px] w-full px-4 md:px-6 xl:px-0">
      <h2 className="main-page-font-display mx-auto w-full max-w-[1196px] text-center text-[30px] leading-[1.42] font-normal md:text-[36px] md:leading-[1.4722] xl:ml-[3px] xl:mr-0 xl:text-left">
        {mainPageCopy.articleIntro.lines.map((line, index) => (
          <span key={line} className="block">
            {index === 0 ? (
              <FlashOpacityText finalOpacity={0.7}>{line}</FlashOpacityText>
            ) : (
              <span style={{ color: 'var(--color-text-display)' }}>{line}</span>
            )}
          </span>
        ))}
      </h2>
    </section>
  )
}
