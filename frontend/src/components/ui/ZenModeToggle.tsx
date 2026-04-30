import { useUI } from '@/store/useUIStore'

export default function ZenModeToggle() {
  const { zenMode, toggleZenMode } = useUI()

  return (
    <button
      onClick={toggleZenMode}
      className={`p-2 rounded-lg transition-all duration-200 border cursor-pointer ${
        zenMode
          ? 'bg-foreground text-white border-outline-active'
          : 'bg-transparent text-foreground border-outline hover:bg-foreground hover:text-white hover:border-outline-active'
      }`}
      aria-label="Toggle zen mode"
      title={zenMode ? 'Exit zen mode' : 'Enter zen mode'}
    >
      <i className="fa-solid fa-wand-magic-sparkles"></i>
    </button>
  )
}
