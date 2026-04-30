import { createPortal } from 'react-dom'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  /** Higher priority modals (like nested modals) should use a higher level */
  level?: 1 | 2 | 3
}

const Z_INDEX_MAP = {
  1: 'z-[60]',
  2: 'z-[70]',
  3: 'z-[80]',
} as const

export function Modal({ isOpen, onClose, children, level = 1 }: ModalProps) {
  if (!isOpen) return null

  return createPortal(
    <div
      className={`fixed inset-0 ${Z_INDEX_MAP[level]} flex items-center justify-center bg-black/50 backdrop-blur-sm`}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body
  )
}

interface ModalContentProps {
  children: React.ReactNode
  /** Max width of the modal */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl'
}

const MAX_WIDTH_MAP = {
  'sm': 'max-w-sm',
  'md': 'max-w-md',
  'lg': 'max-w-lg',
  'xl': 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
} as const

export function ModalContent({ children, maxWidth = 'xl' }: ModalContentProps) {
  return (
    <div
      className={`bg-canvas rounded-lg shadow-2xl border border-outline w-full ${MAX_WIDTH_MAP[maxWidth]} max-h-[85vh] flex flex-col animate-[scaleIn_0.15s_ease-out]`}
    >
      {children}
    </div>
  )
}
