import { memo } from 'react'
import { useTheme } from '@/providers/theme'

export default memo(function ThemeToggle() {
  const { themeMode, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="group w-[36px] h-[36px] flex items-center justify-center rounded-full transition-all duration-200
                 hover:scale-110 active:scale-95 cursor-pointer"
      aria-label="Toggle theme"
    >
      {themeMode === 'light' ? (
        // In light mode, show moon to suggest switching to dark
        <i className="fa-solid fa-moon text-[12px] text-foreground/50 group-hover:text-foreground transition-colors"></i>
      ) : (
        // In dark mode, show sun to suggest switching to light
        <i className="fa-solid fa-sun-bright text-[12px] text-foreground/50 group-hover:text-foreground transition-colors"></i>
      )}
    </button>
  )
})
