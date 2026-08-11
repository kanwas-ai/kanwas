import Image from 'next/image'
import type { Metadata } from 'next'
import { Navbar } from '@/components/prd-template/Navbar'

export const metadata: Metadata = {
  title: 'PRD Template | Kanwas',
  description:
    'A clean, outcome-driven PRD Template you can copy or edit in Kanwas to align stakeholders and ship with clarity.',
  openGraph: {
    title: 'PRD Template | Kanwas',
    description:
      'A clean, outcome-driven PRD Template you can copy or edit in Kanwas to align stakeholders and ship with clarity.',
    images: ['/landing/images/k-og.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PRD Template | Kanwas',
    description:
      'A clean, outcome-driven PRD Template you can copy or edit in Kanwas to align stakeholders and ship with clarity.',
    images: ['/landing/images/k-og.jpg'],
  },
}

const featureCards = [
  {
    title: 'Problem clarity',
    description: 'Anchor on the customer pain, impact, and evidence behind "why now".',
    icon: '/images/problem-clarity.png',
    alt: 'Problem clarity icon',
  },
  {
    title: 'Scope you can defend',
    description: "Define what's in, what's out, and what's intentionally deferred.",
    icon: '/images/defensible-scope.png',
    alt: 'Defensible scope icon',
  },
  {
    title: 'Crisp success metrics',
    description: 'Capture baseline, target, and measurement method so outcomes stay measurable.',
    icon: '/images/success-metrics.png',
    alt: 'Success metrics icon',
  },
  {
    title: 'Risks & mitigations',
    description: "Surface unknowns early - assumptions, dependencies, and how you'll de-risk them.",
    icon: '/images/risks-mitigations.png',
    alt: 'Risks and mitigations icon',
  },
  {
    title: 'Execution-ready plan',
    description: 'Turn ideas into milestones, owners, and sequencing the team can actually run.',
    icon: '/images/execution-plan.png',
    alt: 'Execution plan icon',
  },
  {
    title: 'Decision log',
    description: 'Record trade-offs and rationale so stakeholders stay aligned after launch.',
    icon: '/images/decision-log.png',
    alt: 'Decision log icon',
  },
]

const templateSections = [
  {
    title: 'Executive summary',
    description: 'A one-paragraph narrative that orients busy stakeholders fast (who, what, why now).',
  },
  {
    title: 'Goals and non-goals',
    description: 'A direct list that prevents scope creep and noisy debates.',
  },
  {
    title: 'User stories',
    description: 'Clear stories tied to outcomes, with acceptance criteria to reduce ambiguity.',
  },
  {
    title: 'Milestones',
    description: 'A lightweight plan for sequencing, owners, and progress check-ins.',
  },
  {
    title: 'Risks & assumptions',
    description: 'Document uncertainty before it surprises the team (and note mitigations).',
  },
  {
    title: 'Analytics & launch',
    description: 'Define measurement, rollout, monitoring, and post-launch follow-through.',
  },
]

const writingSteps = [
  {
    title: 'Start with the narrative',
    description:
      "Write the executive summary first - who it's for, what changes, and why now. If it's not clear in 30 seconds, everything else will drift.",
    icon: '/landing/images/describe.png',
    alt: 'Describe icon',
  },
  {
    title: 'Prove the problem',
    description:
      'Add evidence: customer quotes, support volume, revenue impact, retention drops, or competitive pressure. Make the cost of inaction obvious.',
    icon: '/landing/images/fragments.png',
    alt: 'Fragments icon',
  },
  {
    title: 'Set goals and non-goals',
    description:
      'Define outcomes you want and the boundaries you will not cross. Most alignment comes from the non-goals.',
    icon: '/landing/images/pull.png',
    alt: 'Pull icon',
  },
  {
    title: 'Write the user story set',
    description:
      'Turn intent into a small set of user stories, edge cases, and acceptance criteria. Keep it testable, scannable, and easy to review.',
    icon: '/landing/images/hand.png',
    alt: 'Hand icon',
  },
  {
    title: 'Choose an approach',
    description:
      'Describe the solution direction, constraints, and alternatives considered. This reduces rewrites later and makes trade-offs explicit.',
    icon: '/landing/images/question-mark.png',
    alt: 'Question mark icon',
  },
  {
    title: 'Plan delivery and rollout',
    description:
      'Add milestones, owners, dependencies, and a launch plan. Sequence the work so the team can move without waiting.',
    icon: '/landing/images/share.png',
    alt: 'Share icon',
  },
  {
    title: 'Define success and follow-through',
    description:
      'List success metrics, monitoring, and a decision log. Close the loop after launch so the PRD stays useful.',
    icon: '/landing/images/heart.png',
    alt: 'Heart icon',
  },
]

const faqItems = [
  {
    question: 'What is a PRD Template?',
    answer:
      "A PRD Template is a repeatable structure for writing a Product Requirements Document (PRD): the problem, scope, requirements, success metrics, risks, and launch plan - so teams don't start from scratch every time.",
  },
  {
    question: 'Who is this PRD Template for?',
    answer:
      "Product managers, founders, designers, and engineers who need a shared plan that's clear enough to execute and short enough that people actually read it.",
  },
  {
    question: 'Is this PRD Template free to use?',
    answer:
      'Yes. The template preview is public and designed to be copied into your workflow. The Kanwas app will let you customize and collaborate.',
  },
  {
    question: 'Can I use this PRD Template with my team?',
    answer:
      'Absolutely. The structure is built for cross-functional alignment, with sections that work for product, design, and engineering.',
  },
  {
    question: 'What makes this PRD Template different?',
    answer:
      "It's outcome-first and decision-friendly. Each section is purpose-built to remove ambiguity, reduce rework, and keep decisions traceable.",
  },
  {
    question: 'What should a PRD include (at minimum)?',
    answer:
      'Problem framing, goals and non-goals, user stories (or requirements), success metrics, risks/assumptions, milestones, and a launch plan. This PRD Template includes all of them.',
  },
  {
    question: 'How long should a PRD be?',
    answer:
      "Shorter than you think. Aim for clarity over completeness - most PRDs work best when they're skimmable, bullet-driven, and focused on decisions.",
  },
  {
    question: 'Do I need user stories in a PRD?',
    answer:
      'If you want design and engineering to interpret requirements the same way, yes. User stories plus acceptance criteria turn intent into testable behavior.',
  },
  {
    question: 'How do I write good non-goals?',
    answer:
      "List what you're explicitly not doing (and why). Non-goals prevent scope creep, reduce 'while we're here...' requests, and make trade-offs clear.",
  },
  {
    question: 'How should I define success metrics in a PRD?',
    answer:
      "Include a baseline, a target, and how you'll measure it (event names, dashboards, frequency). If a metric doesn't have a measurement plan, it's not ready yet.",
  },
  {
    question: 'How does this PRD Template help prevent scope creep?',
    answer:
      "By forcing explicit 'in/out/deferred' decisions through goals/non-goals, and by keeping assumptions and trade-offs visible through risks and a decision log.",
  },
  {
    question: 'What are acceptance criteria and why do they matter?',
    answer:
      "Acceptance criteria define what 'done' means for a user story. They reduce ambiguity, speed up QA, and prevent rework.",
  },
  {
    question: 'Should a PRD include design details?',
    answer:
      'Only as needed for alignment. Prefer constraints and requirements (what/why) over pixel-level specs (how), unless the project demands it.',
  },
  {
    question: "What's the difference between a PRD and a spec?",
    answer:
      'A PRD explains the problem, goals, and requirements. A spec is usually deeper on technical design and implementation details. Many teams use both.',
  },
  {
    question: 'When should we update the PRD?',
    answer:
      'Any time a decision changes: scope, goals, approach, risks, milestones, or launch plan. Treat the PRD as a living document until launch.',
  },
  {
    question: "What does 'approved PRD' mean in practice?",
    answer:
      'Stakeholders align on the problem, scope (including non-goals), success metrics, major risks, and the delivery/rollout plan. If any of those are fuzzy, approval is premature.',
  },
  {
    question: 'Can I customize the sections?',
    answer:
      'Yes. You can rename, reorder, or expand sections based on your workflow. The PRD Template is meant to flex with your team.',
  },
  {
    question: 'How do I use the Kanwas AI agent with this PRD Template?',
    answer:
      'Use it to review your draft for missing non-goals, unclear metrics, inconsistent requirements, and risky assumptions - then apply suggested edits before stakeholder review.',
  },
]

export default function PrdTemplatePage() {
  return (
    <div className="flex w-full flex-col items-center justify-start border-t border-[#d3d3d3] max-[479px]:overflow-hidden">
      <Navbar />

      <section className="flex w-full max-w-[1200px] flex-col items-center my-[60px] max-[479px]:w-[90%] max-[479px]:my-[24px]">
        <h1 className="mt-0 mb-[10px] text-center font-serif text-[60px] font-[400] leading-[82px] max-[479px]:text-[36px] max-[479px]:leading-[48px]">
          <span className="relative inline-block">
            PRD Template
            <Image
              src="/landing/images/wave-underline.png"
              alt=""
              aria-hidden="true"
              width={210}
              height={18}
              className="pointer-events-none absolute left-0 bottom-[-6px] h-[12px] w-full object-fill"
            />
          </span>{' '}
          for modern product teams
        </h1>
        <p className="mt-0 mb-[10px] max-w-[980px] text-center text-[20px] leading-[32px] text-[#1d1d1d] opacity-80 max-[479px]:text-[16px] max-[479px]:leading-[30px]">
          A clean, outcome-driven PRD Template you can copy or edit in Kanwas to align stakeholders and ship with
          clarity.
        </p>
      </section>

      <section
        id="template"
        className="flex w-full max-w-[1500px] flex-col items-center mt-0 mb-[48px] max-[479px]:w-[90%] max-[479px]:mb-[20px]"
      >
        <div className="flex w-full flex-col items-center justify-start px-[40px] py-[8px] max-[479px]:px-[10px]">
          <p className="mt-0 mb-[14px] max-w-[760px] text-center text-[14px] leading-[22px] text-[#545454] max-[479px]:text-[12px] max-[479px]:leading-[20px]">
            Start with a ready-to-fill Product Requirements Document (PRD) Template - not a blank page. Use the Kanwas
            AI agent to tighten scope, clarify success metrics, and capture decisions as you go.
          </p>
          <div className="w-full overflow-hidden rounded-[20px] border border-[#d8d8d8] bg-white shadow-[0_18px_30px_#00000014]">
            <div className="relative w-full h-[78vh] min-h-[620px] max-h-[920px] max-[991px]:h-[68vh] max-[991px]:min-h-[520px] max-[991px]:max-h-[760px] max-[479px]:h-[56vh] max-[479px]:min-h-[340px] max-[479px]:max-h-[520px]">
              <iframe
                title="PRD Template live preview"
                src="https://seo.kanwas.ai/app/embed"
                className="absolute inset-0 h-full w-full"
                loading="lazy"
                allow="clipboard-write; fullscreen"
              />
            </div>
          </div>
          <div className="mt-[18px] flex flex-wrap items-center justify-center gap-[10px] text-[14px] text-[#545454]">
            <span className="rounded-full bg-[#e6e3e1] px-[12px] py-[6px]">Problem framing</span>
            <span className="rounded-full bg-[#e6e3e1] px-[12px] py-[6px]">Goals and non-goals</span>
            <span className="rounded-full bg-[#e6e3e1] px-[12px] py-[6px]">User stories and acceptance criteria</span>
            <span className="rounded-full bg-[#e6e3e1] px-[12px] py-[6px]">Risks and assumptions</span>
            <span className="rounded-full bg-[#e6e3e1] px-[12px] py-[6px]">Success metrics and launch plan</span>
            <span className="rounded-full bg-[#e6e3e1] px-[12px] py-[6px]">Milestones and ownership</span>
            <span className="rounded-full bg-[#e6e3e1] px-[12px] py-[6px]">Decision log (trade-offs + rationale)</span>
          </div>
        </div>
      </section>

      <section
        id="why"
        className="flex w-full max-w-[1200px] flex-col items-center my-[60px] max-[479px]:w-[90%] max-[479px]:my-[24px]"
      >
        <div className="flex w-full flex-col items-center justify-start rounded-[16px] bg-[#f1f0ef] px-[80px] py-[72px] shadow-[0_20px_20px_#00000005,_inset_0_0_140px_#fffc] max-[479px]:px-[26px] max-[479px]:py-[32px]">
          <div className="relative flex w-full flex-col items-center">
            <h2 className="mt-0 mb-[10px] text-center font-serif text-[36px] font-[400] leading-[48px] max-[479px]:text-[24px] max-[479px]:leading-[36px]">
              Why this PRD Template works
            </h2>
            <p className="mt-0 mb-[30px] max-w-[820px] text-center text-[18px] leading-[30px] text-[#545454] max-[479px]:text-[14px] max-[479px]:leading-[26px]">
              This PRD Template is built for alignment and momentum. Every section helps you answer one critical
              question: what are we building, why does it matter, and how will we know it worked?
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-[18px] max-[991px]:grid-cols-2 max-[479px]:grid-cols-1">
            {featureCards.map((feature) => (
              <div
                key={feature.title}
                className="flex h-full flex-col items-start rounded-[14px] bg-[#f7f5f4] px-[22px] py-[22px] shadow-[0_10px_20px_#0000000a,_inset_0_0_0_1px_#ffffff]"
              >
                <div className="relative mb-[10px] h-[30px] w-full">
                  <Image
                    src={feature.icon}
                    width={120}
                    height={120}
                    alt={feature.alt}
                    className="absolute left-0 top-0 h-[30px] w-auto object-contain"
                  />
                </div>
                <h3 className="m-0 text-[18px] font-[600] leading-[26px] text-[#1d1d1d]">{feature.title}</h3>
                <p className="mt-[6px] mb-0 text-[15px] leading-[26px] text-[#545454]">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="inside"
        className="flex w-full max-w-[1200px] flex-col items-center my-[60px] max-[479px]:w-[90%] max-[479px]:my-[24px]"
      >
        <div className="flex w-full flex-col items-center justify-start rounded-[16px] bg-[#f1f0ef] px-[80px] py-[72px] shadow-[0_20px_20px_#00000005,_inset_0_0_140px_#fffc] max-[479px]:px-[26px] max-[479px]:py-[32px]">
          <h2 className="mt-0 mb-[10px] text-center font-serif text-[36px] font-[400] leading-[48px] max-[479px]:text-[24px] max-[479px]:leading-[36px]">
            What&#8217;s inside the PRD Template
          </h2>
          <p className="mt-0 mb-[30px] max-w-[820px] text-center text-[18px] leading-[30px] text-[#545454] max-[479px]:text-[14px] max-[479px]:leading-[26px]">
            A complete PRD Template structure you can copy and adapt. Each section is short, purposeful, and easy to
            scan.
          </p>
          <div className="grid w-full grid-cols-2 gap-[18px] max-[991px]:grid-cols-1">
            {templateSections.map((section) => (
              <div
                key={section.title}
                className="flex flex-col rounded-[14px] bg-[#f7f5f4] px-[26px] py-[22px] shadow-[0_10px_20px_#0000000a,_inset_0_0_0_1px_#ffffff]"
              >
                <h3 className="m-0 text-[18px] font-[600] leading-[26px] text-[#1d1d1d]">{section.title}</h3>
                <p className="mt-[6px] mb-0 text-[15px] leading-[26px] text-[#545454]">{section.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="how-to-write"
        className="flex w-full max-w-[1200px] flex-col items-center my-[60px] max-[479px]:w-[90%] max-[479px]:my-[24px]"
      >
        <div className="relative flex w-full flex-col items-center justify-start rounded-[16px] bg-[#f1f0ef] px-[80px] py-[72px] shadow-[0_20px_20px_#00000005,_inset_0_0_140px_#fffc] max-[479px]:px-[26px] max-[479px]:py-[32px]">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[16px]">
            <div className="absolute inset-0 bg-[url('/landing/images/grid4.svg')] bg-[size:26px] opacity-25" />
          </div>

          <div className="relative flex w-full flex-col items-center">
            <p className="mt-0 mb-[12px] text-[12px] font-[600] tracking-[0.16em] text-[#545454] uppercase">
              A writing playbook
            </p>
            <h2 className="mt-0 mb-[10px] text-center font-serif text-[36px] font-[400] leading-[48px] max-[479px]:text-[24px] max-[479px]:leading-[36px]">
              How to write a PRD with this template
            </h2>
            <p className="mt-0 mb-[26px] max-w-[860px] text-center text-[18px] leading-[30px] text-[#545454] max-[479px]:text-[14px] max-[479px]:leading-[26px]">
              Use the PRD Template as a checklist, not a novel. Write for speed of understanding: if someone can't get
              the point quickly, execution will drift.
            </p>
          </div>

          <div className="grid w-full grid-cols-12 gap-[18px] max-[991px]:grid-cols-1">
            <div className="col-span-7 max-[991px]:col-span-1">
              <ol className="relative flex flex-col gap-[12px] before:pointer-events-none before:absolute before:left-[17px] before:top-[16px] before:bottom-[16px] before:w-[1px] before:bg-[#dedede] before:content-['']">
                {writingSteps.map((step, index) => (
                  <li key={step.title} className="relative flex gap-[14px]">
                    <div className="relative z-10 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-[#dedede] bg-[#f7f5f4] text-[13px] font-[600] text-[#1d1d1d] shadow-[0_10px_20px_#00000008]">
                      {index + 1}
                    </div>
                    <div className="flex flex-1 flex-col rounded-[14px] border border-[#dedede] bg-[#f7f5f4] px-[22px] py-[18px] shadow-[0_10px_20px_#00000008]">
                      <div className="flex items-center gap-[10px]">
                        <Image src={step.icon} width={18} height={18} alt={step.alt} className="h-[18px] w-[18px]" />
                        <h3 className="m-0 text-[16px] font-[600] leading-[24px] text-[#1d1d1d]">{step.title}</h3>
                      </div>
                      <p className="mt-[6px] mb-0 text-[15px] leading-[26px] text-[#545454]">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="col-span-5 max-[991px]:col-span-1">
              <div className="flex flex-col gap-[12px]">
                <div className="rounded-[14px] border border-[#d8d8d8] bg-white px-[22px] py-[20px] shadow-[0_18px_30px_#00000014]">
                  <p className="mt-0 mb-[10px] text-[12px] font-[600] tracking-[0.16em] text-[#545454] uppercase">
                    Quick checklist
                  </p>
                  <ul className="m-0 list-disc space-y-[8px] pl-[18px] text-[15px] leading-[26px] text-[#545454]">
                    <li>Every section answers one question; remove anything that does not.</li>
                    <li>Write non-goals early; they prevent most scope creep.</li>
                    <li>Use concrete numbers: baseline, target, and how you will measure it.</li>
                    <li>Keep decisions visible: assumptions, trade-offs, open questions, and owners.</li>
                    <li>Prefer bullets over paragraphs (easy to skim, hard to misread).</li>
                  </ul>
                </div>

                <div className="rounded-[14px] border border-[#dedede] bg-[#f7f5f4] px-[22px] py-[20px] shadow-[0_10px_20px_#0000000a]">
                  <p className="mt-0 mb-[10px] text-[12px] font-[600] tracking-[0.16em] text-[#545454] uppercase">
                    Prompt for Kanwas
                  </p>
                  <p className="mt-0 mb-[10px] text-[15px] leading-[26px] text-[#545454]">
                    Use an agent to stress test the PRD before you share it.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="faq"
        className="flex w-full max-w-[1200px] flex-col items-center my-[60px] max-[479px]:w-[90%] max-[479px]:my-[24px]"
      >
        <div className="flex w-full flex-col items-center justify-start rounded-[16px] bg-[#f1f0ef] px-[80px] py-[72px] shadow-[0_20px_20px_#00000005,_inset_0_0_140px_#fffc] max-[479px]:px-[26px] max-[479px]:py-[32px]">
          <h2 className="mt-0 mb-[20px] text-center font-serif text-[36px] font-[400] leading-[48px] max-[479px]:text-[24px] max-[479px]:leading-[36px]">
            PRD Template FAQ
          </h2>
          <div className="flex w-full flex-col gap-[12px]">
            {faqItems.map((item) => (
              <details
                key={item.question}
                className="rounded-[14px] border border-[#dedede] bg-[#f7f5f4] px-[20px] py-[14px] text-[#1d1d1d] shadow-[0_10px_20px_#00000008]"
              >
                <summary className="cursor-pointer text-[16px] font-[600] leading-[26px]">{item.question}</summary>
                <p className="mt-[10px] mb-0 text-[15px] leading-[26px] text-[#545454]">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="flex w-full max-w-[1200px] flex-col items-center my-[60px] mb-[100px] max-[479px]:w-[90%] max-[479px]:mt-[24px]">
        <h2 className="mt-0 mb-[10px] text-center font-serif text-[46px] font-[400] leading-[64px] max-[479px]:text-[28px] max-[479px]:leading-[40px]">
          Ready to use the PRD Template and ship with clarity?
        </h2>
        <p className="mt-0 mb-[22px] max-w-[820px] text-center text-[18px] leading-[30px] text-[#545454] max-[479px]:text-[14px] max-[479px]:leading-[26px]">
          Bring your next product idea into focus and collaborate with your team inside Kanwas.
        </p>
        <div className="mt-[6px] flex items-center justify-between gap-[10px] max-[479px]:flex-col">
          <a
            href="https://www.linkedin.com/in/johancutych/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-[270px] rounded-[16px] border border-[#1f1f1f] bg-[linear-gradient(#393939,#1d1d1d)] px-[24px] py-[11px] text-center text-[16px] leading-[20px] font-[500] text-white no-underline shadow-[0_3px_5px_0_rgba(0,0,0,0.35),inset_0_0_6px_0_rgba(255,255,255,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:brightness-[1.2]"
          >
            DM Johan on LinkedIn to get access
          </a>
          <a
            href="https://calendly.com/johan-kanwas/30min"
            target="_blank"
            className="inline-block w-[270px] rounded-[16px] border border-[#d4d4d4] bg-[#e1e1e1] bg-[url('/landing/images/agent-run-1.png')] bg-[position:0_0] bg-[size:auto] px-[24px] py-[11px] text-center text-[16px] leading-[20px] font-[500] text-[#1d1d1d] no-underline shadow-[0_2px_2px_#0000000a,_inset_0_0_8px_#ffffff4d] transition-all duration-[200ms] ease-[cubic-bezier(.165,.84,.44,1)] hover:shadow-[0_2px_6px_#0000001a,_inset_0_0_8px_#ffffff80]"
          >
            Chat with the team
          </a>
        </div>
        <div className="mt-[80px] flex items-center justify-center gap-[16px]">
          <a href="/" className="flex items-center justify-between no-underline">
            <Image src="/landing/images/k-logo.svg" loading="lazy" width={145} height={50} alt="Kanwas logo" />
          </a>
          <a
            href="/sitemap.xml"
            className="mt-[4px] text-[14px] leading-[18px] text-[#1d1d1d] no-underline opacity-70 hover:opacity-100"
          >
            Sitemap
          </a>
        </div>
      </section>
    </div>
  )
}
