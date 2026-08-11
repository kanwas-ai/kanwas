'use client'

import { useRef, useEffect } from 'react'
import { KanwasRenderer } from './KanwasRenderer.js'

/**
 * Drop-in React component for Kanwas generative art.
 *
 * @param {object} props
 * @param {object} props.config — KanwasRenderer config: { knobs, time, animate, targetFps, minScale, maxPixelRatio }
 * @param {string} [props.className] — CSS class for the container div
 * @param {object} [props.style] — Inline styles for the container div
 * @param {function} [props.onTierChange] — Called when performance tier changes ('animated' | 'static')
 */
export function KanwasCanvas({ config, className, style, onTierChange }) {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)

  // Mount renderer once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'display:block;width:100%;height:100%'
    container.appendChild(canvas)

    const renderer = new KanwasRenderer(canvas, {
      ...config,
      onTierChange,
    })
    rendererRef.current = renderer

    const ok = renderer.start()
    if (!ok && onTierChange) {
      onTierChange('static')
    }

    return () => {
      renderer.destroy()
      rendererRef.current = null
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas)
      }
    }
    // Intentionally only run on mount/unmount — knob updates go through setKnobs below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update knobs when config.knobs changes
  useEffect(() => {
    if (rendererRef.current && config?.knobs) {
      rendererRef.current.setKnobs(config.knobs)
    }
  }, [config?.knobs])

  // Update time when config.time changes
  useEffect(() => {
    if (rendererRef.current && config?.time != null) {
      rendererRef.current.setTime(config.time)
    }
  }, [config?.time])

  return <div ref={containerRef} className={className} style={style} />
}
