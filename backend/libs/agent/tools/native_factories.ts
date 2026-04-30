import { anthropic } from '@ai-sdk/anthropic'
import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './context.js'
import { getToolCallId } from './context.js'
import { createBashExecute } from './native_bash.js'
import {
  OPENAI_FILE_TOOL_MARKDOWN_DESCRIPTION,
  OPENAI_FILE_TOOL_YAML_DESCRIPTION,
  REPOSITION_FILES_DESCRIPTION,
  createRepositionFilesFailure,
  WRITE_FILE_DESCRIPTION,
  createDeleteFileFailure,
  createEditFileFailure,
  createWriteFileFailure,
  deleteFileWithHarness,
  editFileWithHarness,
  getRepositionFilesPreview,
  getOpenAIFileToolPathError,
  getWriteFilePreview,
  isValidOpenAIFileToolPath,
  normalizeOpenAIFileToolMarkdownContent,
  repositionFilesWithHarness,
  writeFileWithHarness,
  type EditFileInput,
  type RepositionFilesInput,
  type WriteFileInput,
} from './native_file_tools.js'
import { createTextEditorExecute, type TextEditorExecuteInput } from './native_text_editor.js'
import {
  WORKSPACE_ROOT,
  formatTextEditorResult,
  isImageResult,
  resolveWorkspaceFilePath,
  resolveWorkspacePath,
  type ProgressCallback,
} from './native_shared.js'

export function createAnthropicNativeTools(context: ToolContext) {
  let currentWorkingDirectory = WORKSPACE_ROOT
  const { sandboxManager, state, agent } = context

  const bashExecute = createBashExecute({
    sandboxManager,
    state,
    agent,
    getCwd: () => currentWorkingDirectory,
    setCwd: (cwd) => {
      currentWorkingDirectory = cwd
    },
  })

  const textEditorExecute = createTextEditorExecute({ sandboxManager, state, agent })

  const bashTool = anthropic.tools.bash_20250124({
    execute: async ({ command, restart }, execContext) => bashExecute.executeBash({ command, restart }, execContext),
  })

  const textEditorTool = anthropic.tools.textEditor_20250728({
    execute: async (input, execContext) => textEditorExecute(input, execContext),
    toModelOutput({ output }) {
      if (isImageResult(output)) {
        return {
          type: 'content' as const,
          value: [
            { type: 'text' as const, text: `Viewing image: ${output.path}` },
            { type: 'media' as const, data: output.data, mediaType: output.mimeType },
          ],
        }
      }

      return { type: 'text' as const, value: output as string }
    },
  })

  return {
    bash: bashTool,
    str_replace_based_edit_tool: textEditorTool,
  }
}

export function createOpenAITools(context: ToolContext) {
  let currentWorkingDirectory = WORKSPACE_ROOT
  const { sandboxManager, state, agent } = context

  const bashExecute = createBashExecute({
    sandboxManager,
    state,
    agent,
    getCwd: () => currentWorkingDirectory,
    setCwd: (cwd) => {
      currentWorkingDirectory = cwd
    },
  })

  const textEditorExecute = createTextEditorExecute({ sandboxManager, state, agent })

  const absoluteCreateSectionSchema = z.object({
    mode: z.literal('create'),
    title: z.string().describe('Unique section title within the current canvas.'),
    layout: z.enum(['horizontal', 'grid']).describe('Section layout mode.'),
    x: z.number().describe('Absolute x coordinate for the new section.'),
    y: z.number().describe('Absolute y coordinate for the new section.'),
    columns: z.number().int().positive().optional().describe('Optional column count when layout is `grid`.'),
  })

  const relativeCreateSectionSchema = z.object({
    mode: z.literal('create'),
    title: z.string().describe('Unique section title within the current canvas.'),
    layout: z.enum(['horizontal', 'grid']).describe('Section layout mode.'),
    placement: z.object({
      mode: z.enum(['after', 'below']).describe('Resolve the new section relative to an existing section.'),
      anchorSectionTitle: z.string().describe('Unique title of the section to place against.'),
      gap: z
        .number()
        .nonnegative()
        .optional()
        .describe('Optional extra spacing in pixels. Omit to use the default section gap of 400 pixels.'),
    }),
    columns: z.number().int().positive().optional().describe('Optional column count when layout is `grid`.'),
  })

  const fileAnchoredCreateSectionSchema = z.object({
    mode: z.literal('create'),
    title: z.string().describe('Unique section title to use when the anchor file is not already in a section.'),
    layout: z.enum(['horizontal', 'grid']).describe('Section layout mode to use when creating a new section.'),
    placement: z.object({
      mode: z.literal('with_file').describe('Place with an existing file in the same canvas.'),
      anchorFilePath: z
        .string()
        .describe(
          'Workspace-relative path of the existing anchor file. If it is already in a section, the target joins that section; otherwise both files become members of the new section.'
        ),
    }),
    columns: z.number().int().positive().optional().describe('Optional column count when layout is `grid`.'),
  })

  const joinSectionSchema = z.object({
    mode: z.literal('join'),
    title: z.string().describe('Unique existing section title within the current canvas.'),
  })

  const sectionSchema = z.union([
    absoluteCreateSectionSchema,
    relativeCreateSectionSchema,
    fileAnchoredCreateSectionSchema,
    joinSectionSchema,
  ])

  const repositionUpdateSectionChangeSchema = z
    .object({
      type: z.literal('update_section'),
      sectionId: z.string().min(1).describe('Existing section ID from metadata.yaml.'),
      title: z.string().min(1).optional().describe('Optional new section title.'),
      layout: z.enum(['horizontal', 'grid']).optional().describe('Optional new section layout.'),
      columns: z.number().int().positive().optional().describe('Optional grid column count.'),
    })
    .passthrough()

  const repositionMoveFilesChangeSchema = z
    .object({
      type: z.literal('move_files'),
      sectionId: z.string().min(1).describe('Existing destination section ID from metadata.yaml.'),
      paths: z.array(z.string()).min(1).describe('Existing workspace-relative file paths to move into the section.'),
    })
    .passthrough()

  const repositionAbsoluteLocationSchema = z.object({
    mode: z.literal('position'),
    x: z.number().describe('Absolute x coordinate for the new section.'),
    y: z.number().describe('Absolute y coordinate for the new section.'),
  })

  const repositionRelativeLocationSchema = z.object({
    mode: z.enum(['after', 'below']).describe('Resolve the new section relative to an existing section.'),
    anchorSectionId: z.string().min(1).describe('Existing anchor section ID from metadata.yaml.'),
    gap: z.number().nonnegative().optional().describe('Optional extra spacing in pixels.'),
  })

  const repositionCreateSectionChangeSchema = z
    .object({
      type: z.literal('create_section'),
      title: z.string().min(1).describe('Unique title for the new section.'),
      layout: z.enum(['horizontal', 'grid']).describe('Section layout mode.'),
      columns: z.number().int().positive().optional().describe('Optional grid column count.'),
      location: z
        .discriminatedUnion('mode', [repositionAbsoluteLocationSchema, repositionRelativeLocationSchema])
        .optional()
        .describe(
          'Required new section location. Use `{ mode: "position", x, y }` for explicit coordinates, or `{ mode: "after" | "below", anchorSectionId, gap? }` for relative placement. Missing or legacy position/placement fields are rejected during execution with an actionable error.'
        ),
      paths: z
        .array(z.string())
        .min(1)
        .describe('Existing workspace-relative file paths to move into the new section.'),
    })
    .passthrough()

  const shellTool = tool({
    description:
      'Runs a shell command and returns its output.\n' +
      '- The `command` input is executed as a shell command string in the sandbox. Use normal shell syntax and quoting.\n' +
      '- Always set the `workdir` param when using the shell function. Do not use `cd` unless absolutely necessary.',
    inputSchema: z.object({
      command: z.string().describe('The shell command string to execute'),
      workdir: z.string().optional().describe('The working directory to execute the command in'),
      timeout_ms: z.number().optional().describe('The timeout for the command in milliseconds'),
    }),
    execute: async (input: { command: string; workdir?: string; timeout_ms?: number }, execContext) => {
      if (input.workdir) {
        currentWorkingDirectory = input.workdir
      }
      return bashExecute.executeBash({ command: input.command }, execContext)
    },
  })

  const readFileTool = tool({
    description:
      'Reads a workspace file or lists a directory in `/workspace`. Use this tool for reading.\n' +
      '- Supports Markdown, YAML, and images, plus directory listings.\n' +
      '- Use absolute `/workspace/...` paths.\n' +
      '- Always reads the full file.',
    inputSchema: z.object({
      path: z.string().describe('The absolute `/workspace/...` file or directory path to read'),
    }),
    execute: async (input: { path: string }, execContext) => {
      const resolvedPath = resolveWorkspacePath(input.path)
      if (!resolvedPath) {
        return 'Error: `read_file` only supports paths inside `/workspace`. Use absolute `/workspace/...` paths.'
      }

      const result = await textEditorExecute(
        {
          command: 'view',
          path: resolvedPath,
        },
        execContext
      )
      return formatTextEditorResult(result)
    },
  })

  const writeFileTool = tool({
    description: WRITE_FILE_DESCRIPTION,
    inputSchema: z.object({
      path: z.string().describe('The workspace-relative file path to create.'),
      section: sectionSchema.describe('Required section intent for the created node.'),
      content: z
        .string()
        .describe(
          'The exact full file contents to write. If the path ends with `.md`, write clean GitHub-flavored Markdown. If the path ends with `.text.yaml` or `.sticky.yaml`, write YAML using `content: |` for the visible text. If the path ends with `.url.yaml`, write YAML with `url`, optional `title`, `description`, and `siteName`, plus `displayMode` set to `preview` or `iframe`. Preserve intentional Markdown formatting exactly, and do not introduce extra trailing backslashes or standalone `\\` lines unless you are intentionally editing that formatting.'
        ),
    }) as any,
    execute: async (input: WriteFileInput, execContext: unknown) => {
      const preview = getWriteFilePreview(input)
      if (!isValidOpenAIFileToolPath(input.path)) {
        return getOpenAIFileToolPathError('write_file')
      }

      if (!input.section) {
        return createWriteFileFailure(new Error('Invalid section: write_file requires a section object.')).modelMessage
      }

      const fullPath = resolveWorkspaceFilePath(input.path)
      const content = fullPath ? normalizeOpenAIFileToolMarkdownContent(fullPath, input.content) : input.content
      const executionInput = content === input.content ? input : { ...input, content }
      const toolCallId = getToolCallId(execContext)
      const markdownBody = fullPath?.toLowerCase().endsWith('.md') ? executionInput.content : undefined

      const itemId = state.addTimelineItem(
        {
          type: 'text_editor',
          command: preview.command ?? 'str_replace',
          path: fullPath ?? WORKSPACE_ROOT,
          animationKey: markdownBody !== undefined ? (fullPath ?? undefined) : undefined,
          markdownBody,
          status: 'executing',
          timestamp: Date.now(),
          agent,
        },
        'text_editor_started',
        toolCallId
      )

      const onProgress: ProgressCallback = (update) => {
        state.updateTimelineItem(itemId, update, 'text_editor_progress')
      }

      try {
        const output = await writeFileWithHarness(sandboxManager, executionInput, onProgress, { toolCallId })
        state.updateTimelineItem(
          itemId,
          { command: output.command, status: 'completed', streamingStatus: undefined },
          'text_editor_completed'
        )
        return output.message
      } catch (error) {
        const failure = createWriteFileFailure(error)
        state.updateTimelineItem(
          itemId,
          {
            status: 'failed',
            error: failure.userMessage,
            rawError: failure.rawError,
            originalFileContent: failure.originalFileContent,
          },
          'text_editor_failed'
        )
        return failure.modelMessage
      }
    },
  })

  const repositionFilesTool = tool({
    description: REPOSITION_FILES_DESCRIPTION,
    inputSchema: z.object({
      canvas: z
        .string()
        .optional()
        .describe('Required workspace-relative canvas directory for every change in this tool call.'),
      changes: z
        .array(
          z.discriminatedUnion('type', [
            repositionUpdateSectionChangeSchema,
            repositionMoveFilesChangeSchema,
            repositionCreateSectionChangeSchema,
          ])
        )
        .min(1)
        .describe('The sequential list of ID-based section changes to apply.'),
    }) as any,
    execute: async (input: RepositionFilesInput, execContext) => {
      let preview = { paths: [] as string[], count: 0 }
      try {
        preview = getRepositionFilesPreview(input)
      } catch {
        preview = { paths: [], count: 0 }
      }

      const toolCallId = getToolCallId(execContext)
      const itemId = state.addTimelineItem(
        {
          type: 'reposition_files',
          paths: preview.paths,
          status: 'executing',
          timestamp: Date.now(),
          agent,
        },
        'reposition_files_started',
        toolCallId
      )

      const onProgress: ProgressCallback = () => {
        state.updateTimelineItem(itemId, { paths: preview.paths }, 'reposition_files_progress')
      }

      try {
        if (Array.isArray(input.changes)) {
          for (const change of input.changes) {
            if ((change.type === 'move_files' || change.type === 'create_section') && Array.isArray(change.paths)) {
              for (const path of change.paths) {
                if (!isValidOpenAIFileToolPath(path)) {
                  throw new Error(getOpenAIFileToolPathError('reposition_files'))
                }
              }
            }
          }
        }

        const output = await repositionFilesWithHarness(sandboxManager, input, onProgress)
        state.updateTimelineItem(itemId, { paths: output.paths, status: 'completed' }, 'reposition_files_completed')
        return output.message
      } catch (error) {
        const failure = createRepositionFilesFailure(error)
        state.updateTimelineItem(
          itemId,
          {
            status: 'failed',
            error: failure.userMessage,
            rawError: failure.rawError,
          },
          'reposition_files_failed'
        )
        return failure.modelMessage
      }
    },
  })

  const editFileTool = tool({
    description:
      'Edits one existing Markdown or YAML file in `/workspace`. Use relative paths only. ' +
      `${OPENAI_FILE_TOOL_MARKDOWN_DESCRIPTION} ` +
      `${OPENAI_FILE_TOOL_YAML_DESCRIPTION} ` +
      'Preserve existing Markdown characters exactly unless you are intentionally changing them: do not add, remove, or duplicate trailing backslashes or standalone `\\` lines just to create spacing. ' +
      'Modes: `replace_exact` replaces one exact unique `old_text` match with `new_text`; `insert_after` inserts `new_text` immediately after one exact unique `anchor_text` match; `replace_entire` rewrites the full contents of one existing file.',
    inputSchema: z.object({
      path: z.string().describe('The workspace-relative file path to edit'),
      mode: z.enum(['replace_exact', 'insert_after', 'replace_entire']).describe('How to edit the file.'),
      old_text: z
        .string()
        .optional()
        .describe(
          'Required for `replace_exact`: the exact current text to replace. It must match exactly once, including whitespace, backslashes, and line breaks.'
        ),
      anchor_text: z
        .string()
        .optional()
        .describe(
          'Required for `insert_after`: the exact current text to insert after. It must match exactly once, including whitespace, backslashes, and line breaks.'
        ),
      new_text: z
        .string()
        .describe(
          'The replacement, inserted, or full-file text to write. If the path ends with `.md`, write clean GitHub-flavored Markdown. If the path ends with `.text.yaml` or `.sticky.yaml`, write YAML using `content: |` for the visible text. If the path ends with `.url.yaml`, write YAML with `url`, optional `title`, `description`, and `siteName`, plus `displayMode` set to `preview` or `iframe`. Preserve intentional Markdown formatting exactly, and do not introduce extra trailing backslashes or standalone `\\` lines unless you are intentionally editing that formatting.'
        ),
    }),
    execute: async (
      input: {
        path: string
        mode: 'replace_exact' | 'insert_after' | 'replace_entire'
        old_text?: string
        anchor_text?: string
        new_text: string
      },
      execContext
    ) => {
      const normalizedInput = normalizeOpenAIEditFileInput(input)
      if (typeof normalizedInput === 'string') {
        return normalizedInput
      }

      if (!isValidOpenAIFileToolPath(normalizedInput.path)) {
        return getOpenAIFileToolPathError('edit_file')
      }

      const fullPath = resolveWorkspaceFilePath(normalizedInput.path)
      const toolCallId = getToolCallId(execContext)
      const command = normalizedInput.mode === 'insert_after' ? 'insert' : 'str_replace'

      const itemId = state.addTimelineItem(
        {
          type: 'text_editor',
          command,
          path: fullPath ?? WORKSPACE_ROOT,
          status: 'executing',
          timestamp: Date.now(),
          agent,
        },
        'text_editor_started',
        toolCallId
      )

      const onProgress: ProgressCallback = (update) => {
        state.updateTimelineItem(itemId, update, 'text_editor_progress')
      }

      try {
        const output = await editFileWithHarness(sandboxManager, normalizedInput, onProgress)
        state.updateTimelineItem(
          itemId,
          { command: output.command, status: 'completed', streamingStatus: undefined },
          'text_editor_completed'
        )
        return output.message
      } catch (error) {
        const failure = createEditFileFailure(error)
        state.updateTimelineItem(
          itemId,
          {
            status: 'failed',
            error: failure.userMessage,
            rawError: failure.rawError,
            originalFileContent: failure.originalFileContent,
          },
          'text_editor_failed'
        )
        return failure.modelMessage
      }
    },
  })

  const deleteFileTool = tool({
    description:
      'Deletes one existing Markdown or YAML file in `/workspace`. Use a workspace-relative path only. Use shell for renames, moves, or non-text files.',
    inputSchema: z.object({
      path: z.string().describe('The workspace-relative file path to delete'),
    }),
    execute: async (input: { path: string }, execContext) => {
      if (!isValidOpenAIFileToolPath(input.path)) {
        return getOpenAIFileToolPathError('delete_file')
      }

      const fullPath = resolveWorkspaceFilePath(input.path)
      const toolCallId = getToolCallId(execContext)

      const itemId = state.addTimelineItem(
        {
          type: 'text_editor',
          command: 'delete',
          path: fullPath ?? WORKSPACE_ROOT,
          status: 'executing',
          timestamp: Date.now(),
          agent,
        },
        'text_editor_started',
        toolCallId
      )

      const onProgress: ProgressCallback = (update) => {
        state.updateTimelineItem(itemId, update, 'text_editor_progress')
      }

      try {
        const output = await deleteFileWithHarness(sandboxManager, input.path, onProgress)
        state.updateTimelineItem(itemId, { status: 'completed', streamingStatus: undefined }, 'text_editor_completed')
        return output
      } catch (error) {
        const failure = createDeleteFileFailure(error)
        state.updateTimelineItem(
          itemId,
          {
            status: 'failed',
            error: failure.userMessage,
            rawError: failure.rawError,
          },
          'text_editor_failed'
        )
        return failure.modelMessage
      }
    },
  })

  return {
    shell: shellTool,
    read_file: readFileTool,
    write_file: writeFileTool,
    reposition_files: repositionFilesTool,
    edit_file: editFileTool,
    delete_file: deleteFileTool,
  }
}

function normalizeOpenAIEditFileInput(input: {
  path: string
  mode: 'replace_exact' | 'insert_after' | 'replace_entire'
  old_text?: string
  anchor_text?: string
  new_text: string
}): EditFileInput | string {
  if (input.mode === 'replace_exact') {
    if (!input.old_text) {
      return 'Error: `edit_file` with `replace_exact` requires a non-empty `old_text` value.'
    }

    return {
      path: input.path,
      mode: 'replace_exact',
      old_text: input.old_text,
      new_text: input.new_text,
    }
  }

  if (input.mode === 'replace_entire') {
    return {
      path: input.path,
      mode: 'replace_entire',
      new_text: input.new_text,
    }
  }

  if (!input.anchor_text) {
    return 'Error: `edit_file` with `insert_after` requires a non-empty `anchor_text` value.'
  }

  return {
    path: input.path,
    mode: 'insert_after',
    anchor_text: input.anchor_text,
    new_text: input.new_text,
  }
}

function createStandardNativeTools(context: ToolContext) {
  let currentWorkingDirectory = WORKSPACE_ROOT
  const { sandboxManager, state, agent } = context

  const bashExecute = createBashExecute({
    sandboxManager,
    state,
    agent,
    getCwd: () => currentWorkingDirectory,
    setCwd: (cwd) => {
      currentWorkingDirectory = cwd
    },
  })

  const textEditorExecute = createTextEditorExecute({ sandboxManager, state, agent })

  const bashTool = tool({
    description:
      'Execute a bash command in the sandbox. The working directory persists between calls. Use restart to reset.',
    inputSchema: z.object({
      command: z.string().optional().describe('The bash command to execute'),
      restart: z.boolean().optional().describe('Set to true to restart the bash session'),
    }),
    execute: async (input: { command?: string; restart?: boolean }, execContext) => {
      return bashExecute.executeBash(input, execContext)
    },
  })

  const textEditorTool = tool({
    description:
      'A text editor tool for viewing, creating, and editing files in the workspace. Supports view, create, str_replace, and insert commands.',
    inputSchema: z.object({
      command: z.enum(['view', 'create', 'str_replace', 'insert']).describe('The editor command to execute'),
      path: z.string().describe('The file path (relative to /workspace or absolute)'),
      file_text: z.string().optional().describe('File content for create command'),
      old_str: z.string().optional().describe('Text to find for str_replace command'),
      new_str: z.string().optional().describe('Replacement text for str_replace/insert commands'),
      insert_line: z.number().optional().describe('Line number to insert after (0 for beginning)'),
      view_range: z
        .array(z.number())
        .optional()
        .describe('Line range [start, end] for view command (1-indexed, -1 for end of file)'),
    }),
    execute: async (input: TextEditorExecuteInput, execContext) => {
      const result = await textEditorExecute(input, execContext)
      return formatTextEditorResult(result)
    },
  })

  return {
    bash: bashTool,
    str_replace_based_edit_tool: textEditorTool,
  }
}

export function createNativeTools(context: ToolContext) {
  if (!context.supportsNativeTools) {
    return createStandardNativeTools(context)
  }
  if (context.providerName === 'anthropic') {
    return createAnthropicNativeTools(context)
  }
  if (context.providerName === 'openai') {
    return createOpenAITools(context)
  }
  return createStandardNativeTools(context)
}
