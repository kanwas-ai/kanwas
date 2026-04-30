import { useState, useEffect, type ReactNode } from 'react'
import { ThemeContext, type ThemeContextValue } from './ThemeContext'
import { lightTheme, darkTheme, type ThemeMode } from '@/constants/themes'

interface ThemeProviderProps {
  children: ReactNode
}

const THEME_STORAGE_KEY = 'kanwas-theme-preference'

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    // Check localStorage first
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }

    // Otherwise, check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }

    return 'light'
  })

  const theme = themeMode === 'dark' ? darkTheme : lightTheme

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      // Only update if user hasn't set a manual preference
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (!stored) {
        setThemeMode(e.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Save theme preference to localStorage and update document class
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode)

    // Update document class
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(themeMode)
  }, [themeMode])

  const toggleTheme = () => {
    // Add transition class before theme change
    document.documentElement.classList.add('theme-transition')

    setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'))

    // Remove transition class after animation completes
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transition')
    }, 300)
  }

  const setThemeModeWithTransition = (mode: ThemeMode) => {
    // Add transition class before theme change
    document.documentElement.classList.add('theme-transition')

    setThemeMode(mode)

    // Remove transition class after animation completes
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transition')
    }, 300)
  }

  const value: ThemeContextValue = {
    theme,
    themeMode,
    toggleTheme,
    setThemeMode: setThemeModeWithTransition,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
