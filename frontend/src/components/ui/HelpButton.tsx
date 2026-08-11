import { memo, useState } from 'react'
import { HelpCheatSheet } from './HelpCheatSheet'

export default memo(function HelpButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="group w-[30px] h-[30px] flex items-center justify-center rounded-full transition-all duration-200
                   hover:scale-110 active:scale-95 cursor-pointer"
        aria-label="Help & shortcuts"
      >
        <i className="fa-regular fa-circle-question text-[14px] text-foreground/50 group-hover:text-foreground transition-colors"></i>
      </button>
      <HelpCheatSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
})
