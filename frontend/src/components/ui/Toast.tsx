import { useEffect, useState } from 'react'
import { getToasts, subscribeToToasts, removeToast, type Toast } from '@/utils/toast'

const borderGradient: Record<string, string> = {
  success: 'linear-gradient(to top right, var(--outline), var(--toast-success))',
  error: 'linear-gradient(to top right, var(--outline), var(--status-error))',
  info: 'linear-gradient(to top right, var(--outline), var(--foreground-muted))',
}

function toastStyle(toast: Toast): React.CSSProperties {
  return {
    border: '1.5px solid transparent',
    background: `linear-gradient(var(--canvas), var(--canvas)) padding-box, ${borderGradient[toast.type] ?? borderGradient.info} border-box`,
  }
}

export const ToastContainer = () => {
  const [toasts, setToasts] = useState(getToasts())

  useEffect(() => {
    const unsubscribe = subscribeToToasts(() => {
      setToasts([...getToasts()])
    })
    return unsubscribe
  }, [])

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={toastStyle(toast)}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 shadow-lg max-w-sm animate-in slide-in-from-top-2 fade-in duration-200"
        >
          <p className="flex-1 text-sm font-medium text-foreground">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 cursor-pointer text-foreground-muted hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <i className="fa-solid fa-xmark text-[12px]" />
          </button>
        </div>
      ))}
    </div>
  )
}
