import { ArticleChip } from '@/components/ui/ArticleChip'

export function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="w-full">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start px-4 md:px-8 lg:px-16">
        <div className="flex flex-col gap-[12px]">
          <h1
            id="hero-title"
            className="w-full main-page-font-display text-[34px] font-normal leading-[1.5] text-[var(--color-brand-text)] md:text-[42px]"
          >
            AI whiteboard for your <strong className="font-bold">second brain</strong>
          </h1>
          <p className="w-full max-w-[957px] main-page-font-brand text-[16px] font-normal leading-[26px] md:text-[20px] md:leading-[32px] text-[var(--color-text-body-new)]">
            For creative deep work that requires human and AI collaboration. Kanwas turns a folder of plain markdown
            files into a canvas you think in.
          </p>
        </div>
        <div className="mt-[14px] flex flex-wrap items-center gap-x-[10px] gap-y-[8px]">
          <span className="main-page-font-brand text-[12px] font-bold uppercase leading-[32px] text-[var(--color-brand-text-40)]">
            Compatible with local coding agents
          </span>
          <ArticleChip>Claude Code</ArticleChip>
          <ArticleChip>Codex</ArticleChip>
          <ArticleChip>OpenCode</ArticleChip>
        </div>
        <div className="my-[18px] flex gap-[8px]">
          {/* <a
            href="https://kanwas.ai/app/register"
            className="inline-flex h-[38px] cursor-pointer items-center justify-center rounded-[16px] bg-[image:var(--gradient-button-primary)] px-[17px] py-[7px] main-page-font-ui text-[16px] font-semibold leading-[24px] whitespace-nowrap text-[var(--color-button-text-on-dark)] shadow-[var(--shadow-button-inner-glow)] transition-opacity hover:opacity-90"
          >
            Get started
          </a> */}
          <a
            href="https://kanwas.ai/app/register"
            className="main-page-font-ui inline-flex h-[38px] cursor-pointer items-center justify-center gap-[8px] rounded-[16px] border border-transparent px-[17px] py-[7px] text-[16px] font-bold leading-[24px] whitespace-nowrap text-white shadow-[0_3px_5px_0_rgba(0,0,0,0.35),inset_0_0_6px_0_rgba(255,255,255,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:brightness-[1.2]"
            style={{
              background:
                'linear-gradient(180deg, #393939 0%, #1D1D1D 100%) padding-box, linear-gradient(180deg, #727272 0%, #000000 100%) border-box',
            }}
          >
            Get started
          </a>
          <a
            href="https://github.com/kanwas-ai/kanwas"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-[38px] cursor-pointer items-center justify-center gap-[6px] rounded-[16px] px-[17px] py-[7px] main-page-font-ui text-[16px] font-semibold leading-[24px] whitespace-nowrap shadow-[0_2px_8px_0_rgba(0,0,0,0.08)] transition-opacity hover:opacity-80"
            style={{ background: '#FCFBF8', border: '1px solid #F6F2EC', color: '#7C7A74' }}
          >
            GitHub
          </a>
        </div>
      </div>
    </section>
  )
}
