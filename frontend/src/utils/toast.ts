type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

const toasts: Toast[] = []
let listeners: Array<() => void> = []

const notify = () => {
  listeners.forEach((listener) => listener())
}

export const showToast = (message: string, type: ToastType = 'info') => {
  const id = Math.random().toString(36).substring(7)
  toasts.push({ id, message, type })
  notify()

  // Auto-remove after 5 seconds
  setTimeout(() => {
    removeToast(id)
  }, 5000)
}

export const removeToast = (id: string) => {
  const index = toasts.findIndex((toast) => toast.id === id)
  if (index > -1) {
    toasts.splice(index, 1)
    notify()
  }
}

export const subscribeToToasts = (listener: () => void) => {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export const getToasts = () => toasts
