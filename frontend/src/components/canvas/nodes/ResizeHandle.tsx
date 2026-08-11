import { useEffect, useRef } from 'react'

export const RESIZE_HANDLE_SIZE = 32
const RESIZE_HANDLE_VIEWBOX_SIZE = 26
const RESIZE_HANDLE_STROKE = 4
const RESIZE_HANDLE_PATH = 'M24 2V12C24 18.6274 18.6274 24 12 24H2'

export function ResizeHandle({ color }: { color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = window.devicePixelRatio || 1
    const pixelSize = Math.max(1, Math.round(RESIZE_HANDLE_SIZE * dpr))

    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize
      canvas.height = pixelSize
    }

    const scale = (RESIZE_HANDLE_SIZE / RESIZE_HANDLE_VIEWBOX_SIZE) * dpr
    const path = new Path2D(RESIZE_HANDLE_PATH)

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, pixelSize, pixelSize)
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.strokeStyle = color
    context.lineWidth = RESIZE_HANDLE_STROKE
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke(path)
  }, [color])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none block"
      width={RESIZE_HANDLE_SIZE}
      height={RESIZE_HANDLE_SIZE}
      style={{ width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE }}
    />
  )
}
