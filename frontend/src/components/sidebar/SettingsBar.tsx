import { useState } from 'react'
import { useAuth } from '@/providers/auth'
import { useMe } from '@/hooks/useMe'

export function SettingsBar() {
  const { state, logout } = useAuth()
  useMe(state.isAuthenticated)
  const [showDropdown, setShowDropdown] = useState(false)

  return (
    <div className="relative pb-3 flex justify-center">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="w-8 h-8 rounded-lg bg-sidebar-item hover:bg-sidebar-active
        hover:text-sidebar-active-content
        text-sidebar-item-content flex items-center justify-center text-sm transition-colors cursor-pointer"
      >
        <i className="fa-solid fa-user"></i>
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute bottom-full left-3 mb-2 z-50 bg-canvas border border-outline rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={() => {
                setShowDropdown(false)
                logout()
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-block-highlight transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-right-from-bracket"></i>
              <span>Logout</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
