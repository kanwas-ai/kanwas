import { FeatureCard } from '@/components/ui/FeatureCard'

const features = [
  {
    icon: 'frame',
    title: (
      <>
        <strong>Canvas</strong> for real work
      </>
    ),
    body: (
      <>
        <strong>Code</strong>, <strong>docs</strong>, <strong>tasks</strong>, <strong>embeds</strong>, and{' '}
        <strong>iframes</strong> into one place and work across them
      </>
    ),
  },
  {
    icon: 'folder',
    title: <strong>Local-first</strong>,
    body: (
      <>
        Your workspace is a <strong>folder on your machine</strong>. Private, fast, works offline.
      </>
    ),
  },
  {
    icon: 'file-lines',
    title: (
      <>
        <strong>Plain .md files</strong> you own
      </>
    ),
    body: (
      <>
        Every document is a <strong>markdown file</strong>. Open it in any editor, grep it, keep it forever.
      </>
    ),
  },
  {
    icon: 'terminal',
    title: (
      <>
        <strong>Coding agents</strong> welcome
      </>
    ),
    body: (
      <>
        <strong>Claude Code</strong>, <strong>Codex</strong>, and <strong>OpenCode</strong> work on your files. The
        canvas updates live.
      </>
    ),
  },
  {
    icon: 'chart-network',
    title: (
      <>
        <strong>Second brain</strong> that compounds
      </>
    ),
    body: (
      <>
        Boards, notes, and decisions build a <strong>knowledge base</strong> that sharpens with use.
      </>
    ),
  },
  {
    icon: 'robot',
    title: (
      <>
        <strong>Agent</strong> with your instructions
      </>
    ),
    body: (
      <>
        Give Kanwas your <strong>rules</strong>, <strong>workflows</strong>, and <strong>skills</strong> so it works
        your way.
      </>
    ),
  },
  {
    icon: 'rocket',
    title: (
      <>
        Use <strong>any model</strong> you want
      </>
    ),
    body: (
      <>
        Run the model stack that fits your work, <strong>Claude</strong>, <strong>GPT</strong>, <strong>Gemini</strong>
        ...
      </>
    ),
  },
  {
    icon: 'code-branch',
    title: (
      <>
        <strong>Git</strong> under the hood
      </>
    ),
    body: (
      <>
        Every change <strong>versioned behind the scenes</strong>. Diff, branch, and roll back your thinking.
      </>
    ),
  },
  {
    icon: 'lock-open',
    title: <strong>No lock-in</strong>,
    body: (
      <>
        <strong>Your files are yours</strong>, with a transparent filesystem under the hood.
      </>
    ),
  },
]

export function SimpleFeatureListSection() {
  return (
    <section
      aria-labelledby="simple-feature-list-title"
      className="flex w-full max-w-[1200px] flex-col items-center gap-[32px] md:gap-[58px] px-4 md:px-8 lg:px-16"
    >
      <h2
        id="simple-feature-list-title"
        className="w-full max-w-[1089px] text-center main-page-font-display text-[26px] font-normal leading-[1.4] md:text-[36px] md:leading-[48px] text-[var(--color-brand-text)]"
      >
        Simple feature list
      </h2>
      <div className="grid w-full grid-cols-1 gap-[20px] md:grid-cols-2 xl:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard
            key={feature.icon}
            icon={feature.icon}
            title={feature.title}
            body={feature.body}
            className="min-h-[166px] w-full"
          />
        ))}
      </div>
    </section>
  )
}
