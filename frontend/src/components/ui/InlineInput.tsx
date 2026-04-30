import { useEffect, useRef, useState } from 'react'

interface InlineInputProps {
  value: string
  onSave: (value: string) => void
  onCancel: () => void
  placeholder?: string
  className?: string
}

export function InlineInput({
  value: initialValue,
  onSave,
  onCancel,
  placeholder = 'Enter name...',
  className = '',
}: InlineInputProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus and select all text when mounted
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (value.trim()) {
        onSave(value.trim())
      } else {
        onCancel()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  const handleBlur = () => {
    if (value.trim() && value.trim() !== initialValue) {
      onSave(value.trim())
    } else {
      onCancel()
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={`
        px-2 py-1 w-full
        bg-canvas border border-outline rounded
        text-foreground text-sm
        focus:outline-none focus:border-foreground
        placeholder:text-foreground-muted
        ${className}
      `}
    />
  )
}
