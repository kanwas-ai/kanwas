import { AdvertisementSection } from '@/components/main-page/AdvertisementSection'
import { ArticleChip } from '@/components/ui/ArticleChip'
import { ArticlePreview } from '@/components/main-page/ArticlePreview'
import { CollaborationMissionSection } from '@/components/main-page/CollaborationMissionSection'
import { CompoundingStepsCards } from '@/components/main-page/CompoundingStepsCards'
import { FeatureShowcaseSection } from '@/components/main-page/FeatureShowcaseSection'
import { HeroMediaSection } from '@/components/main-page/HeroMediaSection'
import { HeroSection } from '@/components/main-page/HeroSection'
import { LandingHeader } from '@/components/main-page/LandingHeader'
import { ProductHuntBanner } from '@/components/main-page/ProductHuntBanner'
import { SectionHeading } from '@/components/main-page/SectionHeading'
import { SimpleFeatureListSection } from '@/components/main-page/SimpleFeatureListSection'
import { TestimonialSection } from '@/components/main-page/TestimonialSection'
import { TrustedByStrip } from '@/components/main-page/TrustedByStrip'
import { WhyTeamsSwitchComparisons } from '@/components/main-page/WhyTeamsSwitchComparisons'

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--color-page-bg-new)]">
      <ProductHuntBanner />
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-[8px] md:px-8 lg:px-16">
        <LandingHeader />
      </div>

      <main
        id="main-content"
        data-page="kanwas-main-page"
        className="mt-[32px] md:mt-[54px] flex w-full flex-col items-center gap-[var(--section-gap)] pb-[96px]"
      >
        <div className="flex w-full flex-col items-center">
          <HeroSection />
          <TrustedByStrip />
          <div className="mt-[32px] md:mt-[60px] w-full">
            <HeroMediaSection />
          </div>
        </div>

        <TestimonialSection />

        <section
          aria-labelledby="features-intro-title"
          className="flex w-full max-w-[1200px] flex-col items-center gap-[var(--gap-features-intro)] px-4 md:px-8 lg:px-16"
        >
          <div className="w-full text-center">
            <SectionHeading
              id="features-intro-title"
              main="Not just answers. Not just outputs. Not starting from scratch."
              secondary="A place to think, iterate & create sharp deliverables."
              className="mx-auto w-[98%]"
            />
            <div className="mt-[16px] flex flex-wrap items-center justify-center gap-x-[10px] gap-y-[8px]">
              <span className="main-page-font-brand text-[12px] font-bold uppercase leading-[32px] text-[var(--color-brand-text-40)]">
                Great for
              </span>
              <ArticleChip>Product Managers</ArticleChip>
              <ArticleChip>Researchers</ArticleChip>
              <ArticleChip>Writers</ArticleChip>
              <ArticleChip>Business Owners</ArticleChip>
            </div>
          </div>
          <FeatureShowcaseSection
            headingId="context-feature-title"
            title="Kanwas builds your second brain"
            body="By learning about you, your work and your decisions. All of it plain markdown files, on your machine, that you own."
            imageSrc="/main-page/new-landing/section1.jpg"
            imageLabel="Workspace context illustration with product, user, and log files"
          />
          <FeatureShowcaseSection
            headingId="alignment-feature-title"
            title="Canvas + your context = transparent thinking"
            body="Every source, idea and trade-off laid out in the open. You see what the AI reasons from - and steer it."
            imageSrc="/main-page/new-landing/section2.jpg"
            imageLabel="Canvas alignment illustration with sticky notes and shared reasoning"
          />
          <FeatureShowcaseSection
            headingId="deliverables-feature-title"
            title="Sharp deliverables in minutes"
            body="PRDs, research reports, essays, business plans. Structured, grounded in your context, ready to ship."
            imageSrc="/main-page/new-landing/section3.jpg"
            imageLabel="Generated stakeholder update and PRD deliverables illustration"
          />
          <FeatureShowcaseSection
            headingId="knowledge-feature-title"
            title="Compounding knowledge base"
            body="Every decision and outcome makes the next thinking and deliverable better than the last."
            imageSrc="/main-page/new-landing/section4.jpg"
            imageLabel="Compounding knowledge base sidebar illustration"
          />
        </section>

        <section
          aria-labelledby="how-we-use-title"
          className="flex w-full max-w-[1200px] flex-col items-center gap-8 px-4 md:px-8 lg:px-16"
        >
          <SectionHeading id="how-we-use-title" main="" secondary="How we love to use Kanwas" className="text-center" />
          <div className="w-full aspect-video rounded-2xl overflow-hidden">
            <iframe
              src="https://www.youtube.com/embed/59YZlQqy_hc"
              title="How we love to use Kanwas"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        </section>

        <section
          aria-labelledby="why-teams-switch-title"
          className="flex w-full max-w-[1200px] flex-col items-center gap-[var(--gap-why-teams-switch)] px-4 md:px-8 lg:px-16"
        >
          <SectionHeading
            id="why-teams-switch-title"
            main="Why people switch?"
            secondary="Chatting with AI is so 2025. Thinking with AI is the future."
            className="text-center"
            lineHeightClassName="leading-[53px]"
          />
          <WhyTeamsSwitchComparisons />
        </section>

        <section
          aria-labelledby="compounding-steps-title"
          className="flex w-full max-w-[1200px] flex-col items-center gap-[var(--gap-compounding-steps)] px-4 md:px-8 lg:px-16"
        >
          <SectionHeading
            id="compounding-steps-title"
            main="The more you use Kanwas,"
            secondary="the more powerful it becomes..."
            className="w-[95%] max-w-[1089px] text-center"
          />
          <CompoundingStepsCards />
        </section>

        <CollaborationMissionSection />

        <SimpleFeatureListSection />

        <section
          aria-labelledby="article-section-title"
          className="flex w-full max-w-[1200px] flex-col gap-[var(--gap-article)] px-4 md:px-8 lg:px-16"
        >
          <SectionHeading
            id="article-section-title"
            main="AI can build anything. "
            secondary="The hard part was never building."
            className="w-[95%]"
            lineHeightClassName="leading-[53px]"
          />
          <ArticlePreview />
        </section>
      </main>
    </div>
  )
}
