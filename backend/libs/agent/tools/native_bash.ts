import type { SandboxManager } from '../sandbox/index.js'
import { OutputBuffer } from '../output_buffer.js'
import type { AgentInfo } from '../types.js'
import type { State } from '../state.js'
import { getToolCallId } from './context.js'
import { THROTTLE_MS, WORKSPACE_ROOT } from './native_shared.js'

export function createBashExecute(deps: {
  sandboxManager: SandboxManager
  state: State
  agent: AgentInfo
  getCwd: () => string
  setCwd: (cwd: string) => void
}) {
  const { sandboxManager, state, agent, getCwd, setCwd } = deps

  return {
    executeBash: async (input: { command?: string; restart?: boolean }, execContext: unknown): Promise<string> => {
      if (input.restart) {
        setCwd(WORKSPACE_ROOT)
        return 'Bash session restarted. Working directory reset to /workspace.'
      }

      const command = input.command
      if (!command) {
        return 'Error: command is required unless restart is true'
      }

      const toolCallId = getToolCallId(execContext)
      const currentWorkingDirectory = getCwd()

      const itemId = state.addTimelineItem(
        {
          type: 'bash',
          command,
          cwd: currentWorkingDirectory,
          status: 'executing',
          timestamp: Date.now(),
          agent,
        },
        'bash_started',
        toolCallId
      )

      const buffer = new OutputBuffer(200)
      let lastEmitTime = 0

      const emitOutputUpdate = () => {
        const displayOutput = buffer.getDisplayOutput()
        if (displayOutput) {
          state.updateTimelineItem(
            itemId,
            {
              output: displayOutput,
              outputLineCount: buffer.getTotalLineCount(),
            },
            'bash_output'
          )
        }
        lastEmitTime = Date.now()
      }

      const onOutput = (data: string) => {
        buffer.append(data)
        if (Date.now() - lastEmitTime >= THROTTLE_MS) {
          emitOutputUpdate()
        }
      }

      try {
        const result = await sandboxManager.execStreaming(command, {
          cwd: currentWorkingDirectory,
          onStdout: onOutput,
          onStderr: onOutput,
        })

        emitOutputUpdate()

        const cdMatch = command.match(/^cd\s+(.+)$/)
        if (cdMatch && result.exitCode === 0) {
          const targetPath = cdMatch[1].trim().replace(/^["']|["']$/g, '')
          const pwdResult = await sandboxManager.exec('pwd', {
            cwd: targetPath.startsWith('/') ? targetPath : `${currentWorkingDirectory}/${targetPath}`,
          })
          if (pwdResult.exitCode === 0) {
            setCwd(pwdResult.stdout.trim())
          }
        }

        let output = ''
        if (result.stdout) output += result.stdout
        if (result.stderr) {
          if (output) output += '\n'
          output += result.stderr
        }
        if (result.exitCode !== 0) {
          output += `\n[Exit code: ${result.exitCode}]`
        }

        state.updateTimelineItem(
          itemId,
          {
            status: 'completed',
            exitCode: result.exitCode,
            output: buffer.getDisplayOutput() || undefined,
            outputLineCount: buffer.getTotalLineCount() || undefined,
          },
          'bash_completed'
        )

        return output || '(no output)'
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        state.updateTimelineItem(
          itemId,
          {
            status: 'failed',
            error: errorMsg,
            output: buffer.getDisplayOutput() || undefined,
            outputLineCount: buffer.getTotalLineCount() || undefined,
          },
          'bash_failed'
        )
        return `Error: ${errorMsg}`
      }
    },
  }
}
