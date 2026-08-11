import { memo } from 'react'
import { useUI } from '@/store/useUIStore'

export default memo(function TerminalToggleButton() {
  const { terminalOpen, toggleTerminalOpen } = useUI()

  return (
    <div className="canvas-toolbar-pill flex items-center p-1 rounded-[56px]">
      <button
        onClick={toggleTerminalOpen}
        className={`canvas-tool-btn${terminalOpen ? ' canvas-tool-btn-armed' : ''}`}
        aria-pressed={terminalOpen}
        aria-label={terminalOpen ? 'Hide terminal' : 'Show terminal'}
        title="Terminal (Ctrl+`)"
      >
        <i className="fa-regular fa-terminal text-[15px] text-foreground" />
      </button>
    </div>
  )
})
