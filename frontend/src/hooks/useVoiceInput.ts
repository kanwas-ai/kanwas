import { useState, useRef, useCallback, useEffect } from 'react'
import { tuyau } from '@/api/client'
import { showToast } from '@/utils/toast'

type VoiceState = 'idle' | 'recording' | 'transcribing'

const MAX_RECORDING_SECONDS = 300

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void
}

function getSupportedMimeType(): string | null {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

export function useVoiceInput({ onTranscript }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceState>('idle')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined' &&
    getSupportedMimeType() !== null

  const cleanupAudio = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current)
      maxDurationTimerRef.current = null
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    // Eagerly release mic and audio context so Chrome drops the recording indicator
    // immediately, rather than waiting for the async onstop callback
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    cleanupAudio()
  }, [cleanupAudio])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Set up Web Audio analyser for waveform visualization
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      const mimeType = getSupportedMimeType()!

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64000,
      })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the mic
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        cleanupAudio()

        const blob = new Blob(chunksRef.current, { type: mimeType })
        chunksRef.current = []

        if (blob.size === 0) {
          setState('idle')
          return
        }

        setState('transcribing')

        try {
          const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm'
          const file = new File([blob], `recording.${ext}`, { type: mimeType })
          const response = await tuyau.transcribe.$post({ audio: file })
          const responseData = response.data

          if (response.error) {
            const msg = (response.error as { error?: string })?.error || 'Transcription failed'
            showToast(msg, 'error')
          } else if (responseData && 'text' in responseData && responseData.text) {
            onTranscript(responseData.text)
          }
        } catch {
          showToast('Failed to reach transcription service', 'error')
        } finally {
          setState('idle')
        }
      }

      mediaRecorder.start()
      setState('recording')

      // Auto-stop after max duration
      maxDurationTimerRef.current = setTimeout(() => {
        stopRecording()
      }, MAX_RECORDING_SECONDS * 1000)
    } catch (err) {
      // Release mic if stream was acquired before the error
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      cleanupAudio()
      setState('idle')
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        showToast('Microphone access denied — check browser permissions', 'error')
      } else {
        showToast('Failed to start recording', 'error')
      }
    }
  }, [onTranscript, cleanupAudio, stopRecording])

  const toggleRecording = useCallback(() => {
    if (state === 'recording') {
      stopRecording()
    } else if (state === 'idle') {
      startRecording()
    }
    // Do nothing if transcribing
  }, [state, startRecording, stopRecording])

  // Cleanup on unmount — release mic, stop recorder, close audio context
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      audioContextRef.current?.close()
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current)
    }
  }, [])

  return {
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
    isSupported,
    toggleRecording,
    analyserRef,
  }
}
