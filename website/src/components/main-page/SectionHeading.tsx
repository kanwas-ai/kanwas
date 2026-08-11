interface SectionHeadingProps {
  id: string
  main: string
  secondary: string
  className?: string
  lineHeightClassName?: string
}

export function SectionHeading({
  id,
  main,
  secondary,
  className,
  lineHeightClassName = 'leading-[1.4] md:leading-[48px]',
}: SectionHeadingProps) {
  return (
    <h2
      id={id}
      className={[
        'main-page-font-display text-[26px] md:text-[34px] font-normal text-[var(--color-brand-text)]',
        lineHeightClassName,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="block text-[var(--color-text-muted)]">{main}</span>
      <span className="block">{secondary}</span>
    </h2>
  )
}
