export interface MeasurementDebugEvent {
  index: number
  atMs: number
  kind: 'log' | 'trace'
  stage: string
  id: string
  payload: Record<string, unknown>
}

declare global {
  interface Window {
    __KANWAS_MEASURE_DEBUG__?: string
    __KANWAS_MEASURE_DEBUG_TO_CONSOLE__?: boolean
    __KANWAS_MEASURE_EVENTS__?: MeasurementDebugEvent[]
    __KANWAS_MEASURE_EVENT_SEQ__?: number
    __KANWAS_MEASURE_CLEAR__?: () => void
    __KANWAS_MEASURE_DUMP__?: () => MeasurementDebugEvent[]
  }
}

const MAX_MEASUREMENT_EVENTS = 1000

function getMeasurementWindow(): Window | null {
  if (typeof window === 'undefined') {
    return null
  }

  window.__KANWAS_MEASURE_EVENTS__ ??= []
  window.__KANWAS_MEASURE_EVENT_SEQ__ ??= 0
  window.__KANWAS_MEASURE_CLEAR__ ??= () => {
    window.__KANWAS_MEASURE_EVENTS__ ??= []
    window.__KANWAS_MEASURE_EVENTS__.length = 0
  }
  window.__KANWAS_MEASURE_DUMP__ ??= () => [...(window.__KANWAS_MEASURE_EVENTS__ ?? [])]

  return window
}

function getMeasurementTimestamp(atMs: number): string {
  return `${Math.round(atMs)}ms`
}

function pushMeasurementEvent(
  kind: MeasurementDebugEvent['kind'],
  stage: string,
  id: string,
  payload: Record<string, unknown>
) {
  const targetWindow = getMeasurementWindow()
  if (!targetWindow) {
    return
  }

  const buffer = targetWindow.__KANWAS_MEASURE_EVENTS__ ?? []
  targetWindow.__KANWAS_MEASURE_EVENTS__ = buffer

  const atMs = performance.now()
  const index = (targetWindow.__KANWAS_MEASURE_EVENT_SEQ__ ?? 0) + 1
  targetWindow.__KANWAS_MEASURE_EVENT_SEQ__ = index

  const event: MeasurementDebugEvent = {
    index,
    atMs,
    kind,
    stage,
    id,
    payload: { ...payload },
  }

  buffer.push(event)
  if (buffer.length > MAX_MEASUREMENT_EVENTS) {
    buffer.splice(0, buffer.length - MAX_MEASUREMENT_EVENTS)
  }

  if (targetWindow.__KANWAS_MEASURE_DEBUG_TO_CONSOLE__ === true) {
    const label = `[measure ${getMeasurementTimestamp(atMs)}] ${stage}`
    if (kind === 'trace') {
      console.trace(label, event)
    } else {
      console.log(label, event)
    }
  }
}

export function shouldLogMeasurement(id: string): boolean {
  const targetWindow = getMeasurementWindow()
  if (!targetWindow) {
    return false
  }

  const target = targetWindow.__KANWAS_MEASURE_DEBUG__
  return target === '*' || target === id
}

export function logMeasurement(stage: string, id: string, payload: Record<string, unknown> = {}): void {
  if (!shouldLogMeasurement(id)) {
    return
  }

  pushMeasurementEvent('log', stage, id, payload)
}

export function traceMeasurement(stage: string, id: string, payload: Record<string, unknown> = {}): void {
  if (!shouldLogMeasurement(id)) {
    return
  }

  pushMeasurementEvent('trace', stage, id, payload)
}

export {}
