import { useState, useRef, useCallback, memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AudioNode as AudioNodeType } from 'shared'
import { useSignedUrl } from '@/hooks/useSignedUrl'
import type { WithCanvasData } from '../types'
import { useTheme } from '@/providers/theme'
import { DocumentName } from './DocumentName'
import { AudioVisualizer } from 'react-audio-visualize'

type AudioNodeProps = WithCanvasData<AudioNodeType>

// Extract extension from filename (e.g., "track.mp3" → ".mp3")
function getExtensionFromFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === 0) return ''
  return filename.slice(lastDot)
}

// Remove extension from filename (e.g., "track.mp3" → "track")
function removeExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === 0) return filename
  return filename.slice(0, lastDot)
}

function AudioNodeComponent({ selected, id, data }: AudioNodeProps) {
  const extension = data.originalFilename ? getExtensionFromFilename(data.originalFilename) : ''
  const documentName = data.documentName || (data.originalFilename ? removeExtension(data.originalFilename) : 'Audio')
  const { themeMode } = useTheme()
  const { onFocusNode } = data

  const handleDoubleClick = () => {
    onFocusNode?.(id)
  }

  // Theme-aware colors for canvas-based visualizer (solid colors, no transparency)
  const barColor = themeMode === 'dark' ? '#6b6b6b' : '#949494'
  const barPlayedColor = themeMode === 'dark' ? '#e5e5e5' : '#1d1d1d'

  // State
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Fetch signed URL
  const { data: signedUrl, isLoading: urlLoading, error: urlError } = useSignedUrl(data.storagePath, data.contentHash)

  // Fetch audio as Blob for visualizer (requires signed URL first)
  const {
    data: audioBlob,
    isLoading: blobLoading,
    error: blobError,
  } = useQuery({
    queryKey: ['audio-blob', signedUrl],
    queryFn: async () => {
      if (!signedUrl) throw new Error('No signed URL')
      const response = await fetch(signedUrl)
      if (!response.ok) throw new Error('Failed to fetch audio')
      return response.blob()
    },
    enabled: !!signedUrl,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Playback handlers
  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch((e) => console.error('Audio play failed:', e))
    }
  }, [isPlaying])

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      setCurrentTime(audio.currentTime)
    }
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      setDuration(audio.duration)
    }
  }, [])

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
    setCurrentTime(0)
  }, [])

  const handlePlay = useCallback(() => setIsPlaying(true), [])
  const handlePause = useCallback(() => setIsPlaying(false), [])

  // Click on waveform to seek
  const handleVisualizerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current
      if (!audio || !duration) return

      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percent = x / rect.width
      audio.currentTime = percent * duration
    },
    [duration]
  )

  // Retry handler
  const handleRetry = useCallback(() => {
    window.location.reload()
  }, [])

  const isLoading = urlLoading || blobLoading
  const error = urlError || blobError

  return (
    <div className="relative">
      <DocumentName nodeId={id} documentName={documentName} extension={extension} />

      <div
        className={`w-[400px] h-[83px] bg-editor rounded-[24px] border-2 flex items-center px-4 gap-4 ${
          selected ? 'border-editor-selected-outline' : 'border-outline'
        }`}
        onDoubleClick={handleDoubleClick}
      >
        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-foreground-muted">
              <div className="w-5 h-5 border-2 border-foreground-muted border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading audio...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-foreground-muted">
              <i className="fa-solid fa-exclamation-triangle text-yellow-500" />
              <span className="text-sm">Failed to load</span>
              <button
                onClick={handleRetry}
                className="px-2 py-1 text-xs bg-block-highlight hover:bg-outline rounded transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Audio player */}
        {signedUrl && audioBlob && !error && (
          <>
            {/* Play/Pause button */}
            <button
              onClick={togglePlay}
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-block-highlight hover:bg-outline transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'} text-foreground`} />
            </button>

            {/* Waveform visualizer */}
            <div className="flex-1 cursor-pointer nodrag" onClick={handleVisualizerClick} title="Click to seek">
              <AudioVisualizer
                key={themeMode}
                blob={audioBlob}
                width={300}
                height={36}
                barWidth={2}
                gap={1}
                barColor={barColor}
                barPlayedColor={barPlayedColor}
                currentTime={currentTime}
              />
            </div>

            {/* Hidden audio element */}
            <audio
              ref={audioRef}
              src={signedUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              onPlay={handlePlay}
              onPause={handlePause}
              preload="metadata"
            />
          </>
        )}
      </div>
    </div>
  )
}

export default memo(AudioNodeComponent)
