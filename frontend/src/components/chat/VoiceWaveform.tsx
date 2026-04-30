import { useRef, useEffect, useState } from 'react'

const BAR_COUNT = 48
const SAMPLE_INTERVAL_MS = 60

interface VoiceWaveformProps {
  analyserRef: React.RefObject<AnalyserNode | null>
  isRecording: boolean
}

export function VoiceWaveform({ analyserRef, isRecording }: VoiceWaveformProps) {
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0))
  const levelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0))
  const rafRef = useRef<number>(0)
  const lastSampleRef = useRef(0)

  useEffect(() => {
    if (!isRecording) {
      levelsRef.current = new Array(BAR_COUNT).fill(0)
      setLevels(new Array(BAR_COUNT).fill(0))
      return
    }

    const dataArray = new Uint8Array(256)

    const tick = (time: number) => {
      const analyser = analyserRef.current
      if (!analyser) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      // Sample at fixed intervals so bars scroll at a consistent pace
      if (time - lastSampleRef.current >= SAMPLE_INTERVAL_MS) {
        lastSampleRef.current = time

        analyser.getByteTimeDomainData(dataArray)

        // Compute RMS level (0-1)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / dataArray.length)
        // Amplify and clamp to 0-1
        const level = Math.min(1, rms * 6)

        const next = [...levelsRef.current.slice(1), level]
        levelsRef.current = next
        setLevels(next)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isRecording, analyserRef])

  return (
    <div className="flex items-center justify-center gap-[2px] h-12 w-full">
      {levels.map((level, i) => {
        // Minimum bar height of 3px, max 44px
        const height = Math.max(3, level * 44)
        return (
          <div
            key={i}
            className="rounded-full transition-[height] duration-75"
            style={{
              width: '2.5px',
              height: `${height}px`,
              backgroundColor: 'var(--foreground)',
              opacity: level > 0.01 ? 0.7 : 0.2,
            }}
          />
        )
      })}
    </div>
  )
}
