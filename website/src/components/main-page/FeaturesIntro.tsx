import { mainPageCopy } from '@/content/main-page/content'

export function FeaturesIntro() {
  return (
    <section data-section="features-intro" className="w-full px-4 md:px-6 xl:px-0">
      <h2 className="main-page-font-display mx-auto w-full max-w-[1196px] text-center text-[30px] leading-[1.42] font-normal md:text-[36px] md:leading-[1.4722] xl:ml-[2px] xl:mr-0 xl:text-left">
        {mainPageCopy.featuresIntro.lines.map((line, index) => (
          <span key={`features-intro-line-${index}`} className="block">
            {line}
          </span>
        ))}
      </h2>
    </section>
  )
}
