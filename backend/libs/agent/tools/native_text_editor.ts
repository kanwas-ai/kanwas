import type { SandboxManager } from '../sandbox/index.js'
import type { AgentInfo } from '../types.js'
import type { State } from '../state.js'
import { getToolCallId } from './context.js'
import {
  IMAGE_EXTENSIONS,
  WORKSPACE_ROOT,
  isAllowedFileType,
  type ProgressCallback,
  type TextEditorResult,
} from './native_shared.js'

export interface TextEditorExecuteInput {
  command: 'view' | 'create' | 'str_replace' | 'insert'
  path: string
  file_text?: string
  old_str?: string
  new_str?: string
  insert_line?: number
  view_range?: number[]
}

async function handleView(
  sandbox: SandboxManager,
  path: string,
  viewRange?: number[],
  onProgress?: ProgressCallback
): Promise<TextEditorResult> {
  if (await sandbox.isDirectory(path)) {
    onProgress?.({ streamingStatus: 'Listing directory...' })
    const entries = await sandbox.listDirectory(path)
    return entries.join('\n')
  }

  const fileCheck = isAllowedFileType(path)
  if (!fileCheck.allowed) {
    return `Error: The text editor tool cannot view this file type. For files like PDF, CSV, DOCX, or other binary formats, use python3 with the bash tool instead. Example: python3 -c "import pandas; df = pandas.read_csv('${path}'); print(df)"`
  }

  const ext = path.toLowerCase().slice(path.lastIndexOf('.'))
  const mimeType = IMAGE_EXTENSIONS[ext]

  if (mimeType) {
    onProgress?.({ streamingStatus: 'Reading image...' })
    const result = await sandbox.exec(`base64 -w 0 "${path}"`)
    if (result.exitCode !== 0) {
      return `Error reading image: ${result.stderr || 'Unknown error'}`
    }

    return {
      isImage: true,
      data: result.stdout.trim(),
      mimeType,
      path,
    }
  }

  onProgress?.({ streamingStatus: 'Reading file...' })
  const content = await sandbox.readFile(path)
  const lines = content.split('\n')
  const totalLines = lines.length

  onProgress?.({
    streamingStatus: `Read ${totalLines} lines`,
    linesRead: totalLines,
    totalLines,
  })

  if (viewRange && viewRange.length === 2) {
    const [start, end] = viewRange
    const startIdx = Math.max(0, start - 1)
    const endIdx = end === -1 ? lines.length : Math.min(lines.length, end)
    const sliced = lines.slice(startIdx, endIdx)
    onProgress?.({ streamingStatus: `Lines ${startIdx + 1}-${endIdx}` })
    return sliced.map((line, index) => `${startIdx + index + 1}: ${line}`).join('\n')
  }

  return lines.map((line, index) => `${index + 1}: ${line}`).join('\n')
}

async function handleCreate(
  sandbox: SandboxManager,
  path: string,
  content: string,
  onProgress?: ProgressCallback
): Promise<string> {
  if (await sandbox.fileExists(path)) {
    return 'Error: File already exists. Use str_replace to modify existing files.'
  }

  const totalLines = content.split('\n').length
  const headingMatch = content.match(/^#{1,3}\s+(.+)$/m)
  if (headingMatch) {
    onProgress?.({
      streamingStatus: `Writing "${headingMatch[1]}"...`,
      totalLines,
    })
  } else {
    onProgress?.({
      streamingStatus: `Writing ${totalLines} lines...`,
      totalLines,
    })
  }

  await sandbox.writeFile(path, content)
  return 'File created successfully.'
}

async function handleStrReplace(
  sandbox: SandboxManager,
  path: string,
  oldStr: string,
  newStr: string,
  onProgress?: ProgressCallback
): Promise<string> {
  if (!(await sandbox.fileExists(path))) {
    return 'Error: File not found'
  }

  onProgress?.({ streamingStatus: 'Reading file...' })
  const content = await sandbox.readFile(path)
  const count = content.split(oldStr).length - 1

  if (count === 0) {
    return 'Error: No match found for replacement. Please check your text and try again.'
  }
  if (count > 1) {
    return `Error: Found ${count} matches for replacement text. Please provide more context to make a unique match.`
  }

  const newContent = content.replace(oldStr, newStr)
  const totalLines = newContent.split('\n').length
  onProgress?.({
    streamingStatus: 'Applying changes...',
    totalLines,
  })
  await sandbox.writeFile(path, newContent)
  return 'Successfully replaced text at exactly one location.'
}

async function handleInsert(
  sandbox: SandboxManager,
  path: string,
  insertLine: number,
  newStr: string,
  onProgress?: ProgressCallback
): Promise<string> {
  if (!(await sandbox.fileExists(path))) {
    return 'Error: File not found'
  }

  onProgress?.({ streamingStatus: 'Reading file...' })
  const content = await sandbox.readFile(path)
  const lines = content.split('\n')

  if (insertLine < 0 || insertLine > lines.length) {
    return `Error: Invalid line number. File has ${lines.length} lines.`
  }

  lines.splice(insertLine, 0, newStr)
  const nextContent = lines.join('\n')
  const totalLines = nextContent.split('\n').length
  onProgress?.({
    streamingStatus: `Inserting at line ${insertLine}...`,
    totalLines,
  })
  await sandbox.writeFile(path, nextContent)
  return `Successfully inserted text after line ${insertLine}.`
}

export function createTextEditorExecute(deps: { sandboxManager: SandboxManager; state: State; agent: AgentInfo }) {
  const { sandboxManager, state, agent } = deps

  return async (input: TextEditorExecuteInput, execContext: unknown): Promise<TextEditorResult> => {
    const {
      command,
      path,
      file_text: fileText,
      old_str: oldStr,
      new_str: newStr,
      insert_line: insertLine,
      view_range: viewRange,
    } = input

    const fullPath = path.startsWith('/') ? path : `${WORKSPACE_ROOT}/${path}`
    if (!fullPath.startsWith(WORKSPACE_ROOT)) {
      return 'Error: Path must be within /workspace'
    }

    if (command !== 'view') {
      const fileCheck = isAllowedFileType(fullPath)
      if (!fileCheck.allowed || fileCheck.isImage) {
        return 'Error: The text editor tool only supports Markdown and YAML files for editing. For other file types like PDF, CSV, or binary files, use python3 with the bash tool instead.'
      }
    }

    switch (command) {
      case 'create':
        if (fileText === undefined || fileText === null) {
          return "Error: Missing required parameter 'file_text' for 'create' command. Provide the content to write."
        }
        break
      case 'str_replace':
        if (oldStr === undefined || oldStr === null) {
          return "Error: Missing required parameter 'old_str' for 'str_replace' command."
        }
        if (newStr === undefined || newStr === null) {
          return "Error: Missing required parameter 'new_str' for 'str_replace' command."
        }
        break
      case 'insert':
        if (insertLine === undefined || insertLine === null) {
          return "Error: Missing required parameter 'insert_line' for 'insert' command."
        }
        if (newStr === undefined || newStr === null) {
          return "Error: Missing required parameter 'new_str' for 'insert' command."
        }
        break
    }

    const toolCallId = getToolCallId(execContext)

    const itemId = state.addTimelineItem(
      {
        type: 'text_editor',
        command,
        path: fullPath,
        status: 'executing',
        timestamp: Date.now(),
        agent,
        viewRange: viewRange?.length === 2 ? (viewRange as [number, number]) : undefined,
      },
      'text_editor_started',
      toolCallId
    )

    const onProgress: ProgressCallback = (update) => {
      state.updateTimelineItem(itemId, update, 'text_editor_progress')
    }

    try {
      let result: TextEditorResult

      switch (command) {
        case 'view':
          result = await handleView(sandboxManager, fullPath, viewRange, onProgress)
          break
        case 'create':
          result = await handleCreate(sandboxManager, fullPath, fileText!, onProgress)
          break
        case 'str_replace':
          result = await handleStrReplace(sandboxManager, fullPath, oldStr!, newStr!, onProgress)
          break
        case 'insert':
          result = await handleInsert(sandboxManager, fullPath, insertLine!, newStr!, onProgress)
          break
      }

      state.updateTimelineItem(itemId, { status: 'completed', streamingStatus: undefined }, 'text_editor_completed')
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      state.updateTimelineItem(
        itemId,
        {
          status: 'failed',
          error: errorMsg,
        },
        'text_editor_failed'
      )
      return `Error: ${errorMsg}`
    }
  }
}
