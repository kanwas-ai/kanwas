'use client'

import Image from 'next/image'
import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { mainPageCopy } from '@/content/main-page/content'

const articleAudioSrc = '/main-page/article/elevenlabs-audio-project.mp3'

type AudioVisualizerComponent = (typeof import('react-audio-visualize'))['AudioVisualizer']

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00'
  }

  const roundedSeconds = Math.floor(seconds)
  const minutes = Math.floor(roundedSeconds / 60)
  const remainingSeconds = roundedSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

export function ArticleReader({ children, lineCount }: { children: ReactNode; lineCount: number }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioViewportRef = useRef<HTMLDivElement>(null)
  const waveformHostRef = useRef<HTMLDivElement>(null)

  const [isArticleUnlocked, setIsArticleUnlocked] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioSource, setAudioSource] = useState<string | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [waveformWidth, setWaveformWidth] = useState(0)
  const [isAudioNearViewport, setIsAudioNearViewport] = useState(false)
  const [playWhenReady, setPlayWhenReady] = useState(false)
  const [AudioVisualizerComponent, setAudioVisualizerComponent] = useState<AudioVisualizerComponent | null>(null)

  useEffect(() => {
    const node = waveformHostRef.current
    if (!node) {
      return
    }

    const updateWaveformWidth = () => {
      setWaveformWidth(Math.max(120, Math.floor(node.clientWidth)))
    }

    updateWaveformWidth()
    const observer = new ResizeObserver(updateWaveformWidth)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const node = audioViewportRef.current
    if (!node || isAudioNearViewport || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsAudioNearViewport(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: '320px 0px',
      }
    )

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [isAudioNearViewport])

  useEffect(() => {
    if (!isAudioNearViewport || AudioVisualizerComponent) {
      return
    }

    let isCancelled = false

    import('react-audio-visualize')
      .then((module) => {
        if (isCancelled) {
          return
        }

        setAudioVisualizerComponent(() => module.AudioVisualizer)
      })
      .catch(() => undefined)

    return () => {
      isCancelled = true
    }
  }, [AudioVisualizerComponent, isAudioNearViewport])

  useEffect(() => {
    if (!isAudioNearViewport || audioBlob) {
      return
    }

    const controller = new AbortController()
    let isCancelled = false

    const decodeDurationFromBlob = async (blob: Blob) => {
      const arrayBuffer = await blob.arrayBuffer()
      const audioContext = new window.AudioContext()

      try {
        const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer)
        if (!isCancelled && Number.isFinite(decodedBuffer.duration) && decodedBuffer.duration > 0) {
          setAudioDuration(decodedBuffer.duration)
        }
      } finally {
        await audioContext.close().catch(() => undefined)
      }
    }

    fetch(articleAudioSrc, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Audio file failed to load.')
        }

        return response.blob()
      })
      .then((blob) => {
        if (isCancelled) {
          return
        }

        setAudioBlob(blob)
        setAudioSource((previousSource) => {
          if (previousSource) {
            URL.revokeObjectURL(previousSource)
          }

          return URL.createObjectURL(blob)
        })
        setAudioError(null)

        return decodeDurationFromBlob(blob).catch(() => undefined)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setPlayWhenReady(false)
        setAudioError(error instanceof Error ? error.message : 'Audio file failed to load.')
      })

    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [audioBlob, isAudioNearViewport])

  useEffect(() => {
    return () => {
      if (audioSource) {
        URL.revokeObjectURL(audioSource)
      }
    }
  }, [audioSource])

  const audioTimeText = useMemo(() => {
    if (audioDuration <= 0) {
      return mainPageCopy.articleReader.audioDuration
    }

    if (isPlaying || audioCurrentTime > 0) {
      return formatDuration(audioCurrentTime)
    }

    return formatDuration(audioDuration)
  }, [audioCurrentTime, audioDuration, isPlaying])

  const visualizerCurrentTime = useMemo(() => {
    if (audioDuration <= 0) {
      return audioCurrentTime
    }

    return Math.min(audioDuration, Math.max(0, audioCurrentTime))
  }, [audioCurrentTime, audioDuration])

  const toggleAudioPlayback = () => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (!isAudioNearViewport) {
      setIsAudioNearViewport(true)
    }

    if (!audioSource) {
      setPlayWhenReady(true)
      return
    }

    if (audio.paused) {
      audio.play().catch(() => {
        setAudioError('Playback is blocked until you interact with the page.')
      })
      return
    }

    audio.pause()
  }

  const handleSeek = (event: MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || audioDuration <= 0) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const clampedPosition = Math.min(rect.width, Math.max(0, clickX))
    const nextTime = (clampedPosition / rect.width) * audioDuration

    audio.currentTime = nextTime
    setAudioCurrentTime(nextTime)
  }

  return (
    <section id="thesis" data-section="article-reader" className="w-full">
      <div
        className={`relative mx-auto w-full overflow-hidden rounded-[16px] border-2 border-[var(--color-border)] bg-[var(--color-surface-card-new)] shadow-[0_10px_36px_rgba(0,0,0,0.07),inset_0_0_48px_rgba(255,255,255,1)] ${
          isArticleUnlocked ? 'h-auto' : 'h-[620px] sm:h-[700px] md:h-[860px] xl:h-[1006px]'
        }`}
      >
        <div
          data-role="article-scroll-container"
          className="h-full overflow-x-hidden overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="mx-auto w-full max-w-[820px] px-4 pb-6 pt-6 md:px-8 md:pb-8 md:pt-8 xl:px-0 xl:pb-[50px] xl:pt-[50px]">
            <div className="relative h-[143px] overflow-hidden rounded-[9px]">
              <Image
                src="/main-page/article/article-image.png"
                alt="Article visual"
                width={820}
                height={163}
                sizes="(max-width: 1024px) calc(100vw - 48px), 820px"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="mt-[12px] flex flex-wrap items-center gap-[12px] max-[520px]:flex-col max-[520px]:items-center max-[520px]:gap-2">
              <div className="flex flex-wrap items-center gap-[12px] max-[520px]:justify-center">
                <span className="main-page-pill">{mainPageCopy.articleReader.readTime}</span>
                <span data-role="article-line-count" className="main-page-pill max-[520px]:hidden">
                  {lineCount} lines
                </span>
                <span className="main-page-pill">{mainPageCopy.articleReader.published}</span>
              </div>
              <button
                data-role="article-read-later"
                type="button"
                className="main-page-font-ui inline-flex h-[44px] items-center gap-[8px] rounded-[31px] border border-[#FFFBF1] bg-[var(--color-surface-warm)] px-[14px] py-[7px] text-[14px] leading-[1.2103] font-semibold text-[#525252] shadow-[0_2px_2px_rgba(227,209,170,0.3),inset_0_0_8px_0_rgba(255,255,255,1)] md:h-[31px]"
                style={{ display: 'none' }}
              >
                <span aria-hidden="true" className="inline-flex h-[11px] w-[11px] items-center justify-center">
                  <svg viewBox="0 0 16 16" className="h-[11px] w-[11px]" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M14.7 1.3L7.2 14.8L5.7 9.4L0.3 7.9L14.7 1.3Z"
                      fill="currentColor"
                      stroke="currentColor"
                      strokeWidth="0.8"
                    />
                  </svg>
                </span>
                <span>{mainPageCopy.articleReader.readLater}</span>
              </button>
            </div>

            <div
              ref={audioViewportRef}
              data-role="article-audio-container"
              className="mt-[28px] w-full"
              style={{ display: 'none' }}
            >
              <p className="main-page-font-ui m-0 ml-[11px] text-[14px] leading-[24px] font-medium text-[#929292]">
                {mainPageCopy.articleReader.audioTitle}
              </p>

              <div
                data-role="article-audio-player"
                className="relative mt-[2px] flex h-[83px] items-center overflow-hidden rounded-[14px] border-2 border-[var(--color-border)] bg-[var(--color-surface-white)]"
              >
                <div className="flex w-full items-center pl-[12px] pr-[28px]">
                  <button
                    type="button"
                    onClick={toggleAudioPlayback}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[#353535] opacity-95 transition-opacity hover:opacity-70"
                    aria-label={isPlaying ? 'Pause article audio' : 'Play article audio'}
                  >
                    {isPlaying ? (
                      <svg
                        viewBox="128 96 384 448"
                        className="h-[24px] w-[17px]"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M176 96C149.5 96 128 117.5 128 144L128 496C128 522.5 149.5 544 176 544L240 544C266.5 544 288 522.5 288 496L288 144C288 117.5 266.5 96 240 96L176 96zM400 96C373.5 96 352 117.5 352 144L352 496C352 522.5 373.5 544 400 544L464 544C490.5 544 512 522.5 512 496L512 144C512 117.5 490.5 96 464 96L400 96z"
                          fill="currentColor"
                        />
                      </svg>
                    ) : (
                      <svg
                        viewBox="128 96 416 448"
                        className="h-[24px] w-[17px]"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </button>

                  <span className="main-page-font-ui pointer-events-none inline-block w-[39px] shrink-0 text-center text-[14px] leading-[1.2103] font-semibold text-[rgba(29,29,29,0.5)]">
                    {audioTimeText}
                  </span>

                  <div
                    ref={waveformHostRef}
                    data-role="article-audio-visualizer"
                    onClick={handleSeek}
                    className="ml-[12px] h-[36px] min-w-0 flex-1 cursor-pointer overflow-hidden"
                  >
                    {audioBlob && waveformWidth > 0 && AudioVisualizerComponent ? (
                      <AudioVisualizerComponent
                        key={waveformWidth}
                        blob={audioBlob}
                        width={waveformWidth}
                        height={36}
                        barWidth={3}
                        gap={3}
                        barColor="rgba(29, 29, 29, 0.5)"
                        barPlayedColor="#353535"
                        currentTime={visualizerCurrentTime}
                      />
                    ) : (
                      <div className="h-full w-full rounded-[6px] bg-[repeating-linear-gradient(90deg,rgba(29,29,29,0.5)_0_3px,transparent_3px_6px)] opacity-70" />
                    )}
                  </div>
                </div>

                {audioError ? (
                  <span className="main-page-font-ui pointer-events-none absolute bottom-[8px] left-1/2 -translate-x-1/2 text-center text-[11px] text-[rgba(29,29,29,0.45)]">
                    {audioError}
                  </span>
                ) : null}

                <audio
                  ref={audioRef}
                  src={audioSource ?? undefined}
                  onCanPlay={(event) => {
                    setAudioError(null)
                    if (playWhenReady) {
                      event.currentTarget.play().catch(() => {
                        setAudioError('Playback is blocked until you interact with the page.')
                      })
                      setPlayWhenReady(false)
                    }
                  }}
                  onLoadedMetadata={(event) => setAudioDuration(event.currentTarget.duration)}
                  onTimeUpdate={(event) => setAudioCurrentTime(event.currentTarget.currentTime)}
                  onError={() => {
                    setPlayWhenReady(false)
                    setAudioError('Audio file failed to load.')
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => {
                    setIsPlaying(false)
                    setAudioCurrentTime(0)
                  }}
                  preload={isAudioNearViewport ? 'metadata' : 'none'}
                />
              </div>
            </div>

            <div className="mt-[36px] main-page-markdown">{children}</div>
          </div>
        </div>

        {!isArticleUnlocked ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[92px] bg-gradient-to-b from-transparent to-[var(--color-surface-card-new)]"
            />

            <button
              data-role="article-read-full"
              type="button"
              onClick={() => setIsArticleUnlocked(true)}
              className="main-page-font-ui absolute bottom-[30px] left-1/2 z-20 inline-flex h-[44px] w-max -translate-x-1/2 items-center justify-center whitespace-nowrap rounded-[16px] border border-transparent px-[16px] text-[16px] leading-6 font-bold text-white shadow-[0_3px_5px_0_rgba(0,0,0,0.35),inset_0_0_6px_0_rgba(255,255,255,0.35)] transition-all duration-200 hover:-translate-x-1/2 hover:-translate-y-[1px] hover:brightness-[1.2] md:h-[38px]"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, #393939 0%, #1D1D1D 100%), linear-gradient(180deg, #727272 0%, #000000 100%)',
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
              }}
            >
              Read whole article
            </button>
          </>
        ) : null}
      </div>
    </section>
  )
}
