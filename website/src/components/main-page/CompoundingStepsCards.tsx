import { StepCard } from '@/components/ui/StepCard'

const steps = [
  {
    step: 1 as const,
    title: 'Start in seconds',
    body: 'Point Kanwas at a folder and your markdown files become a living canvas.',
    image: {
      src: '/main-page/new-landing/step1.png',
      alt: 'Kanwas start in seconds illustration',
      width: 670,
      height: 435,
    },
  },
  {
    step: 2 as const,
    title: 'Kanwas builds your second brain',
    body: 'Building a context layer in plain .md files, so agents know your work.',
    image: {
      src: '/main-page/new-landing/step2.png',
      alt: 'Kanwas context building illustration',
      width: 689,
      height: 430,
    },
  },
  {
    step: 3 as const,
    title: 'Make 10x better decisions',
    body: 'Your taste and judgment, amplified by AI reasoning and spatial context.',
    image: {
      src: '/main-page/new-landing/step3.png',
      alt: 'Kanwas better decisions illustration',
      width: 670,
      height: 424,
    },
  },
]

export function CompoundingStepsCards() {
  return (
    <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
      {steps.map((item) => (
        <StepCard key={item.step} step={item.step} title={item.title} image={item.image} className="w-full">
          {item.body}
        </StepCard>
      ))}
    </div>
  )
}
