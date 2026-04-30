import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { executeDebugBash, getSandboxStatus, shutdownSandbox } from '@/api/debugBash'

export interface TerminalLine {
  id: string
  type: 'input' | 'output' | 'error'
  content: string
  cwd?: string
  timestamp: number
}

export function useDebugBash(workspaceId: string) {
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [currentCwd, setCurrentCwd] = useState('/workspace')
  const [history, setHistory] = useState<string[]>([])
  const lineIdCounter = useRef(0)
  const cwdInitialized = useRef(false)

  // Poll sandbox status
  const statusQuery = useQuery({
    queryKey: ['sandbox-status', workspaceId],
    queryFn: () => getSandboxStatus(workspaceId),
    refetchInterval: 2000, // Poll every 2 seconds
    enabled: !!workspaceId,
  })

  // Initialize cwd from status response when sandbox exists
  useEffect(() => {
    if (statusQuery.data?.available && statusQuery.data.cwd && !cwdInitialized.current) {
      setCurrentCwd(statusQuery.data.cwd)
      cwdInitialized.current = true
    }
  }, [statusQuery.data])

  const execute = useCallback(
    async (command: string) => {
      const trimmedCommand = command.trim()
      if (!trimmedCommand || isExecuting) return

      // Handle clear command locally
      if (trimmedCommand === 'clear') {
        setLines([])
        return
      }

      const inputId = `line-${++lineIdCounter.current}`

      // Add input line
      setLines((prev) => [
        ...prev,
        {
          id: inputId,
          type: 'input',
          content: trimmedCommand,
          cwd: currentCwd,
          timestamp: Date.now(),
        },
      ])

      // Add to history
      setHistory((prev) => [...prev.filter((h) => h !== trimmedCommand), trimmedCommand])

      setIsExecuting(true)

      try {
        const result = await executeDebugBash(workspaceId, trimmedCommand)

        let output = result.stdout
        if (result.stderr) {
          output = output ? `${output}\n${result.stderr}` : result.stderr
        }
        if (result.exitCode !== 0) {
          output = output ? `${output}\n[exit code: ${result.exitCode}]` : `[exit code: ${result.exitCode}]`
        }

        if (output) {
          setLines((prev) => [
            ...prev,
            {
              id: `line-${++lineIdCounter.current}`,
              type: result.exitCode === 0 ? 'output' : 'error',
              content: output,
              timestamp: Date.now(),
            },
          ])
        }

        setCurrentCwd(result.cwd)
        // Refetch status after command execution (sandbox may have been created)
        statusQuery.refetch()
      } catch (error) {
        setLines((prev) => [
          ...prev,
          {
            id: `line-${++lineIdCounter.current}`,
            type: 'error',
            content: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          },
        ])
      } finally {
        setIsExecuting(false)
      }
    },
    [workspaceId, currentCwd, isExecuting, statusQuery]
  )

  const clear = useCallback(() => setLines([]), [])

  /**
   * Shutdown the sandbox if agent is not running.
   * Call this when the terminal is unmounted/closed.
   */
  const shutdown = useCallback(async () => {
    try {
      await shutdownSandbox(workspaceId)
      statusQuery.refetch()
    } catch {
      // Ignore errors - sandbox may already be gone
    }
  }, [workspaceId, statusQuery])

  return {
    lines,
    isExecuting,
    currentCwd,
    history,
    execute,
    clear,
    shutdown,
    sandboxAvailable: statusQuery.data?.available ?? false,
    agentRunning: statusQuery.data?.agentRunning ?? false,
    isCheckingStatus: statusQuery.isLoading,
  }
}
