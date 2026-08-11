const STORAGE_KEY = 'x-correlation-id'

export function getCorrelationId(): string | null {
  return sessionStorage.getItem(STORAGE_KEY)
}

export function setCorrelationId(id: string): void {
  sessionStorage.setItem(STORAGE_KEY, id)
}

export function getOrCreateCorrelationId(): string {
  let id = getCorrelationId()
  if (!id) {
    id = crypto.randomUUID()
    setCorrelationId(id)
  }
  return id
}
