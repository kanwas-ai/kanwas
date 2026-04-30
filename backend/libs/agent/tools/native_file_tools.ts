import { posix as pathPosix } from 'node:path'
import type { SandboxManager } from '../sandbox/index.js'
import { extractJsonObjectField, extractJsonStringField } from '../utils/json_streaming.js'
import {
  WORKSPACE_ROOT,
  isAllowedFileType,
  resolveWorkspacePath,
  resolveWorkspaceFilePath,
  shellQuote,
  type ProgressCallback,
} from './native_shared.js'
import { parseFileSection } from 'shared'
import type { FileSection, SectionLayout } from 'shared'

export type OpenAIFileToolCommand = 'create' | 'delete' | 'insert' | 'str_replace'

export type FileSectionInput =
  | {
      mode: 'create'
      title: string
      layout: SectionLayout
      x: number
      y: number
      columns?: number
    }
  | {
      mode: 'create'
      title: string
      layout: SectionLayout
      placement: {
        mode: 'after' | 'below'
        anchorSectionTitle: string
        gap?: number
      }
      columns?: number
    }
  | {
      mode: 'create'
      title: string
      layout: SectionLayout
      placement: {
        mode: 'with_file'
        anchorFilePath: string
      }
      columns?: number
    }
  | {
      mode: 'join'
      title: string
    }

export type WriteFileInput = {
  path: string
  content: string
  section: FileSectionInput
}

export type RepositionSectionLocationInput =
  | {
      mode: 'position'
      x: number
      y: number
    }
  | {
      mode: 'after' | 'below'
      anchorSectionId: string
      gap?: number
    }

export type RepositionUpdateSectionChange = {
  type: 'update_section'
  sectionId: string
  title?: string
  layout?: SectionLayout
  columns?: number
}

export type RepositionMoveFilesChange = {
  type: 'move_files'
  sectionId: string
  paths: string[]
}

export type RepositionCreateSectionChange = {
  type: 'create_section'
  title: string
  layout: SectionLayout
  columns?: number
  location: RepositionSectionLocationInput
  paths: string[]
}

export type RepositionSectionChange =
  | RepositionUpdateSectionChange
  | RepositionMoveFilesChange
  | RepositionCreateSectionChange

export type RepositionFilesInput = {
  canvas: string
  changes: RepositionSectionChange[]
}

type LiveFileAnchorPlacement = {
  exists: boolean
  destinationSectionTitle: string | null
  createsSectionTitle: string | null
}

export type WriteFilePreview = {
  command: 'create'
  path?: string
  lineCount?: number
  content?: string
}

export type WriteFileResult = {
  status: 'success'
  command: 'create'
  path: string
  message: string
  section: FileSection
}

export type RepositionFilesPreview = {
  paths: string[]
  count: number
}

export type RepositionFilesResult = {
  status: 'success'
  paths: string[]
  message: string
}

export type EditFileResult = {
  status: 'success'
  command: 'str_replace' | 'insert'
  path: string
  message: string
}

type EditFileBase = {
  path: string
}

export type EditFileInput =
  | (EditFileBase & {
      mode: 'replace_exact'
      old_text: string
      new_text: string
    })
  | (EditFileBase & {
      mode: 'insert_after'
      anchor_text: string
      new_text: string
    })
  | (EditFileBase & {
      mode: 'replace_entire'
      new_text: string
    })

export const OPENAI_FILE_TOOL_MARKDOWN_DESCRIPTION =
  'For Markdown, write clean GitHub-flavored Markdown: use ATX headings (`#`), blank lines between blocks, `*` unordered lists, `1.` ordered lists, task lists when useful, fenced code blocks with language tags, markdown links, and normalized pipe tables. Use normal blank lines for spacing instead of trailing backslashes or standalone `\\` lines; only include those hard-break markers when the user explicitly asks for them or you are preserving intentional existing content exactly. Avoid raw HTML and Mermaid; if you need a diagram, use ASCII art inside a code block.'

export const OPENAI_FILE_TOOL_YAML_DESCRIPTION =
  'For YAML node files, match the node type to the path. `.text.yaml` and `.sticky.yaml` should usually be YAML with a `content: |` block containing the visible text. `.url.yaml` should be YAML with `url` plus optional `title`, `description`, and `siteName`, and should include `displayMode` set to either `preview` or `iframe`.'

type MarkdownFence = {
  marker: '`' | '~'
  length: number
}

export interface FileToolFailure {
  userMessage: string
  modelMessage: string
  rawError: string
  originalFileContent?: string
}

type FileToolFailureContext = {
  originalFileContent?: string
}

type WriteFileStreamingState = {
  pending: Promise<void>
  preflightKey?: string
  placeholderPath?: string
  placementPreparedPath?: string
  sectionResolved?: boolean
  fileAnchorResolved?: boolean
  preflightError?: string
}

type WriteFileExecutionOptions = {
  toolCallId?: string
}

const writeFileStreamingStates = new Map<string, WriteFileStreamingState>()
const PLACEMENT_ROOT = '/tmp/kanwas-placement'
const LIVE_STATE_SERVER_PORT = 43127
const SECTION_WAIT_TIMEOUT_MS = 5_000
const SECTION_WAIT_TIMEOUT_ERROR_PREFIX = 'Section not found after waiting:'
const ANCHOR_FILE_WAIT_TIMEOUT_ERROR_PREFIX = 'File anchor not found after waiting:'
const FILE_ANCHOR_SECTION_TITLE_CONFLICT_ERROR_PREFIX = 'Section already exists for unsectioned anchor file:'

class FileToolExecutionError extends Error {
  originalFileContent?: string

  constructor(message: string, context: FileToolFailureContext = {}) {
    super(message)
    this.name = 'FileToolExecutionError'
    this.originalFileContent = context.originalFileContent
  }
}

export const WRITE_FILE_DESCRIPTION = `Use the \`write_file\` tool to create one new Markdown or YAML file in \`/workspace\`.
Provide a workspace-relative \`path\`, required semantic \`section\`, and the exact \`content\`.

Section can be:
- \`{ mode: "create", title, layout, x, y, columns? }\` to create a new section at an explicit position and add the file to it
- \`{ mode: "create", title, layout, placement: { mode: "after" | "below", anchorSectionTitle, gap? }, columns? }\` to create a new section relative to an existing section and let the frontend resolve the final position; omit \`gap\` to use the default section spacing of \`400\` pixels
- \`{ mode: "create", title, layout, placement: { mode: "with_file", anchorFilePath }, columns? }\` to place the file with an existing file in the same canvas; if the anchor file is already in a section the new file joins that section, otherwise both files are combined into the new section
- \`{ mode: "join", title }\` to add the file to an existing section with that unique title in the same canvas

Section titles must be unique within a canvas. Use \`layout: "horizontal"\` for a left-to-right strip, or \`layout: "grid"\` with optional \`columns\` for a compact grid.
When you create a new section, always format the title as \`<emoji> <title>\`, for example \`🧭 Overview\`. When you join an existing section, use its exact current title.

${OPENAI_FILE_TOOL_MARKDOWN_DESCRIPTION}

${OPENAI_FILE_TOOL_YAML_DESCRIPTION}

When writing Markdown, do not create visual spacing with trailing backslashes or standalone \`\\\` lines unless the user explicitly asks for hard-break formatting.

Use workspace-relative paths only. This tool only creates new files and fails if the target already exists. To rewrite an existing file, use \`edit_file\` with \`replace_entire\`. For targeted edits inside an existing file, prefer \`edit_file\`. For renames or moves, use \`shell\`.`

export const REPOSITION_FILES_DESCRIPTION = `Use the \`reposition_files\` tool to edit canvas sections and reorganize existing canvas-backed files in \`/workspace\`.

Before calling this tool, read the canvas \`metadata.yaml\` and use section IDs from that file. Existing section operations must target \`sectionId\`, not section titles.

Supported change types:
- Top-level \`canvas\` is required once per tool call and must be the workspace-relative canvas directory, for example \`"inspiration-tips"\`.
- \`{ type: "update_section", sectionId, title?, layout?, columns? }\` renames a section and/or changes its layout. Use this to convert an existing section to \`layout: "grid"\`; do not create a temporary section just to change layout.
- \`{ type: "move_files", sectionId, paths }\` moves existing files into an existing section. \`paths\` must be a non-empty array of workspace-relative file paths in the same canvas.
- \`{ type: "create_section", title, layout, columns?, location, paths }\` creates a new section and moves existing files into it. \`paths\` must be non-empty because empty sections are not preserved.

For \`create_section.location\`, use exactly one location object:
- \`{ mode: "position", x, y }\` to create the section at an explicit canvas position
- \`{ mode: "after" | "below", anchorSectionId, gap? }\` to place the section relative to another existing section by ID

When creating or renaming a section title, format the title as \`<emoji> <title>\`, for example \`🧭 Overview\`.

All changes in one call target the top-level \`canvas\`; do not put \`canvas\` inside individual change objects. Use workspace-relative canvas paths and file paths only. Use \`write_file\` to create new files. Use \`shell\` for filesystem renames or moves.`

const INVALID_PATH_ERROR_SUFFIX =
  'only supports relative file paths inside `/workspace`. Use `notes/todo.md`, not `/workspace/notes/todo.md`.'
const UNSUPPORTED_FILE_TYPE_ERROR = 'Unsupported file type: only Markdown and YAML files are supported.'
const FILE_ALREADY_EXISTS_ERROR_PREFIX = 'File already exists:'
const INVALID_SECTION_ERROR_PREFIX = 'Invalid section:'
const CREATE_SECTION_LOCATION_ERROR =
  'create_section now requires location. Use location: { mode: "position", x, y } or location: { mode: "after" | "below", anchorSectionId, gap? }.'
const REPOSITION_TOP_LEVEL_CANVAS_ERROR =
  'reposition_files requires top-level canvas. Use the active canvas path, for example "inspiration-tips".'
const REPOSITION_LEGACY_CHANGE_CANVAS_ERROR =
  'reposition_files now uses one top-level canvas. Move canvas to the tool input and remove canvas from individual changes.'

export function isValidOpenAIFileToolPath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && resolveWorkspaceFilePath(path) !== null
}

export function getOpenAIFileToolPathError(
  toolName: 'write_file' | 'edit_file' | 'delete_file' | 'reposition_files'
): string {
  return `Error: \`${toolName}\` ${INVALID_PATH_ERROR_SUFFIX}`
}

export function getWriteFilePreview(input: string | WriteFileInput): WriteFilePreview {
  if (typeof input !== 'string') {
    const content = normalizeOpenAIFileToolMarkdownContent(input.path, input.content)

    return {
      command: 'create',
      path: input.path || undefined,
      lineCount: countContentLines(content) || undefined,
      content: content || undefined,
    }
  }

  const path = extractJsonStringField(input, 'path') || undefined
  const rawContent = extractJsonStringField(input, 'content') || undefined
  const content = path && rawContent ? normalizeOpenAIFileToolMarkdownContent(path, rawContent) : rawContent
  return {
    command: 'create',
    path,
    lineCount: content ? countContentLines(content) : undefined,
    content,
  }
}

export async function writeFileWithHarness(
  sandbox: SandboxManager,
  input: WriteFileInput,
  onProgress?: ProgressCallback,
  options: WriteFileExecutionOptions = {}
): Promise<WriteFileResult> {
  onProgress?.({ streamingStatus: 'Validating file input...' })
  const normalizedSection = validateWriteFileSection(input.section)

  const fullPath = resolveAndValidateFilePath(input.path)
  const content = normalizeOpenAIFileToolMarkdownContent(fullPath, input.content)
  const streamingState = await getWriteFileStreamingState(options.toolCallId)
  const placeholderPath = streamingState?.placeholderPath

  if (streamingState?.preflightError) {
    clearWriteFileStreamingState(options.toolCallId)
    throw new Error(streamingState.preflightError)
  }

  if (placeholderPath && placeholderPath !== fullPath) {
    await cleanupEmptyWriteFilePlaceholder(sandbox, placeholderPath)
    await cleanupCanvasIntent(sandbox, placeholderPath)
    clearWriteFileStreamingState(options.toolCallId)
    throw new Error(`${INVALID_SECTION_ERROR_PREFIX} target path changed during streaming.`)
  }

  const existed = await sandbox.fileExists(fullPath)
  if (existed && placeholderPath !== fullPath) {
    clearWriteFileStreamingState(options.toolCallId)
    throw new Error(`${FILE_ALREADY_EXISTS_ERROR_PREFIX} ${input.path}`)
  }

  await ensureWorkspaceParentDirectory(sandbox, fullPath)

  try {
    const awaitedSectionTitle = getSectionTitleToAwait(normalizedSection)
    if (awaitedSectionTitle && !streamingState?.sectionResolved) {
      await awaitSectionInSandbox(sandbox, fullPath, awaitedSectionTitle, SECTION_WAIT_TIMEOUT_MS)
    }

    if (getFileAnchorPath(normalizedSection)) {
      await resolveFileAnchorPlacementResult(sandbox, fullPath, normalizedSection, {
        timeoutMs: streamingState?.fileAnchorResolved === true ? 0 : SECTION_WAIT_TIMEOUT_MS,
      })
    }

    if (streamingState?.placementPreparedPath !== fullPath) {
      await writeCanvasIntent(sandbox, fullPath, { section: normalizedSection })
    }

    onProgress?.({
      streamingStatus: `Writing ${countContentLines(content)} lines...`,
      totalLines: countContentLines(content),
    })

    await sandbox.writeFile(fullPath, content)
  } catch (error) {
    if (placeholderPath === fullPath) {
      await cleanupEmptyWriteFilePlaceholder(sandbox, fullPath)
      await cleanupCanvasIntent(sandbox, fullPath)
    }
    clearWriteFileStreamingState(options.toolCallId)
    throw error
  }

  clearWriteFileStreamingState(options.toolCallId)

  return {
    status: 'success',
    command: 'create',
    path: input.path,
    section: normalizedSection,
    message: `File success: ${input.path} was created.`,
  }
}

export async function repositionFilesWithHarness(
  sandbox: SandboxManager,
  input: RepositionFilesInput,
  onProgress?: ProgressCallback
): Promise<RepositionFilesResult> {
  if (!Array.isArray(input.changes) || input.changes.length === 0) {
    throw new Error(`${INVALID_SECTION_ERROR_PREFIX} reposition_files requires at least one change.`)
  }

  return repositionSectionsWithHarness(sandbox, input.canvas, input.changes, onProgress)
}

async function repositionSectionsWithHarness(
  sandbox: SandboxManager,
  canvas: unknown,
  changes: RepositionSectionChange[],
  onProgress?: ProgressCallback
): Promise<RepositionFilesResult> {
  assertNoLegacyChangeCanvas(changes)
  const normalizedCanvas = normalizeRepositionCanvas(canvas)
  const normalizedChanges = validateRepositionSectionChanges(changes)

  onProgress?.({
    streamingStatus: `Applying ${normalizedChanges.length} section change${
      normalizedChanges.length === 1 ? '' : 's'
    }...`,
  })

  await applySectionChangesInSandbox(sandbox, normalizedCanvas, normalizedChanges)

  const targets = normalizedChanges.flatMap((change) => {
    if (change.type === 'update_section') {
      return [normalizedCanvas]
    }

    return change.paths
  })

  return {
    status: 'success',
    paths: targets,
    message: `Applied ${normalizedChanges.length} section change${normalizedChanges.length === 1 ? '' : 's'}.`,
  }
}

function validateRepositionSectionChanges(changes: unknown[]): RepositionSectionChange[] {
  const normalizedChanges: RepositionSectionChange[] = []

  for (const change of changes) {
    if (!change || typeof change !== 'object') {
      throw new Error(`${INVALID_SECTION_ERROR_PREFIX} unsupported reposition change.`)
    }

    const changeRecord = change as Record<string, unknown>
    const changeType = changeRecord.type
    if (changeType !== 'update_section' && changeType !== 'move_files' && changeType !== 'create_section') {
      throw new Error(`${INVALID_SECTION_ERROR_PREFIX} unsupported reposition change type: ${String(changeType)}`)
    }

    if (changeType === 'update_section') {
      const sectionId = normalizeRequiredString(changeRecord.sectionId, 'update_section.sectionId')
      const hasTitle = changeRecord.title !== undefined
      const hasLayout = changeRecord.layout !== undefined
      const hasColumns = changeRecord.columns !== undefined
      if (!hasTitle && !hasLayout && !hasColumns) {
        throw new Error(`${INVALID_SECTION_ERROR_PREFIX} update_section requires title, layout, or columns.`)
      }

      normalizedChanges.push({
        type: 'update_section',
        sectionId,
        ...(hasTitle ? { title: normalizeRequiredString(changeRecord.title, 'update_section.title') } : {}),
        ...(hasLayout ? { layout: changeRecord.layout as SectionLayout } : {}),
        ...(hasColumns ? { columns: changeRecord.columns as number } : {}),
      })
      continue
    }

    if (changeType === 'move_files') {
      const sectionId = normalizeRequiredString(changeRecord.sectionId, 'move_files.sectionId')
      const paths = validateSectionChangePaths(changeRecord.paths)
      normalizedChanges.push({ type: 'move_files', sectionId, paths })
      continue
    }

    if (
      changeRecord.position !== undefined ||
      changeRecord.placement !== undefined ||
      changeRecord.location === undefined
    ) {
      throw new Error(`${INVALID_SECTION_ERROR_PREFIX} ${CREATE_SECTION_LOCATION_ERROR}`)
    }

    const title = normalizeRequiredString(changeRecord.title, 'create_section.title')
    const paths = validateSectionChangePaths(changeRecord.paths)
    normalizedChanges.push({
      type: 'create_section',
      title,
      layout: changeRecord.layout as SectionLayout,
      ...(changeRecord.columns !== undefined ? { columns: changeRecord.columns as number } : {}),
      location: changeRecord.location as RepositionSectionLocationInput,
      paths,
    })
  }

  return normalizedChanges
}

function assertNoLegacyChangeCanvas(changes: unknown[]): void {
  for (const change of changes) {
    if (change && typeof change === 'object' && 'canvas' in change) {
      throw new Error(`${INVALID_SECTION_ERROR_PREFIX} ${REPOSITION_LEGACY_CHANGE_CANVAS_ERROR}`)
    }
  }
}

function normalizeRepositionCanvas(canvas: unknown): string {
  if (typeof canvas !== 'string' || !canvas.trim()) {
    throw new Error(`${INVALID_SECTION_ERROR_PREFIX} ${REPOSITION_TOP_LEVEL_CANVAS_ERROR}`)
  }

  const normalizedCanvas = canvas.trim()
  resolveAndValidateCanvasPath(normalizedCanvas)
  return normalizedCanvas
}

function validateSectionChangePaths(paths: unknown): string[] {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error(`${INVALID_SECTION_ERROR_PREFIX} section file changes require a non-empty paths array.`)
  }

  const normalizedPaths: string[] = []
  for (const path of paths) {
    const normalizedPath = normalizeWorkspaceRelativePath(path, 'path')
    resolveAndValidateRepositionFilePath(normalizedPath)
    normalizedPaths.push(normalizedPath)
  }

  return normalizedPaths
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${INVALID_SECTION_ERROR_PREFIX} ${fieldName} must be a non-empty string.`)
  }

  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${INVALID_SECTION_ERROR_PREFIX} ${fieldName} must be a non-empty string.`)
  }

  return normalized
}

function normalizeWorkspaceRelativePath(value: unknown, fieldName: string): string {
  const normalized = normalizeRequiredString(value, fieldName)
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
  if (normalized.startsWith('/')) {
    throw new Error(`Invalid path: ${normalized}`)
  }

  return normalized
}

async function applySectionChangesInSandbox(
  sandbox: SandboxManager,
  canvasPath: string,
  changes: RepositionSectionChange[]
): Promise<void> {
  const command = buildApplySectionChangesCommand(canvasPath, changes)
  const result = await sandbox.exec(command, { cwd: WORKSPACE_ROOT, timeoutMs: SECTION_WAIT_TIMEOUT_MS + 1_000 })
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()

  if (result.exitCode !== 0) {
    throw new Error(getSectionApplyError(output) || output || 'Failed to apply section changes.')
  }

  let parsed: { ok?: boolean; error?: string }
  try {
    parsed = JSON.parse(result.stdout) as { ok?: boolean; error?: string }
  } catch {
    throw new Error('Failed to parse section apply response.')
  }

  if (parsed.ok !== true) {
    throw new Error(parsed.error || 'Failed to apply section changes.')
  }
}

function getSectionApplyError(output: string): string | null {
  if (!output) {
    return null
  }

  try {
    const parsed = JSON.parse(output) as { error?: unknown }
    return typeof parsed.error === 'string' && parsed.error.trim() ? parsed.error.trim() : null
  } catch {
    return null
  }
}

export function buildApplySectionChangesCommand(canvasPath: string, changes: RepositionSectionChange[]): string {
  const payload = JSON.stringify({ canvasPath, changes })
  const script = [
    `const payload = ${JSON.stringify(payload)}`,
    `const url = ${JSON.stringify(`http://127.0.0.1:${LIVE_STATE_SERVER_PORT}/sections/apply`)}`,
    'const main = async () => {',
    '  const response = await fetch(url, {',
    '    method: "POST",',
    '    headers: { "content-type": "application/json" },',
    '    body: payload,',
    '  })',
    '  const text = await response.text()',
    '  if (!response.ok) {',
    '    process.stderr.write(text)',
    '    process.exit(1)',
    '  }',
    '  process.stdout.write(text)',
    '}',
    'main().catch((error) => { process.stderr.write(error instanceof Error ? error.message : String(error)); process.exit(1) })',
  ]

  return `node --input-type=module -e ${shellQuote(script.join('\n'))}`
}

type ExpectedPlacementResult = {
  destinationSectionTitle: string
  createsSectionTitle: string | null
}

async function resolveFileAnchorPlacementResult(
  sandbox: SandboxManager,
  targetFilePath: string,
  section: FileSection,
  options: { timeoutMs?: number } = {}
): Promise<ExpectedPlacementResult | null> {
  const anchorFilePath = getFileAnchorPath(section)
  if (!anchorFilePath) {
    return null
  }

  const anchorFullPath = resolveAndValidateRepositionFilePath(anchorFilePath)
  if (anchorFullPath === targetFilePath) {
    throw new Error(`${INVALID_SECTION_ERROR_PREFIX} file anchor cannot reference the target file.`)
  }

  const placement = await queryFileAnchorPlacementInSandbox(
    sandbox,
    targetFilePath,
    anchorFilePath,
    section.title,
    options.timeoutMs ?? SECTION_WAIT_TIMEOUT_MS
  )

  if (!placement.exists) {
    throw new Error(`${ANCHOR_FILE_WAIT_TIMEOUT_ERROR_PREFIX} ${anchorFilePath}`)
  }

  if (!placement.destinationSectionTitle) {
    throw new Error(`Failed to resolve file-anchor placement for: ${anchorFilePath}`)
  }

  return {
    destinationSectionTitle: placement.destinationSectionTitle,
    createsSectionTitle: placement.createsSectionTitle,
  }
}

export function prepareWriteFileDuringStreaming(
  sandbox: SandboxManager,
  toolCallId: string | undefined,
  input: string | WriteFileInput
): void {
  if (!toolCallId) {
    return
  }

  const parsedInput = tryParseStreamingWriteFileBootstrapInput(input)
  if (!parsedInput) {
    return
  }

  const fullPath = tryResolveWriteFilePath(parsedInput.path)
  if (!fullPath) {
    return
  }

  if (!fullPath.toLowerCase().endsWith('.md')) {
    return
  }

  let normalizedSection: FileSection
  try {
    normalizedSection = validateWriteFileSection(parsedInput.section)
  } catch {
    return
  }

  const state = getOrCreateWriteFileStreamingState(toolCallId)
  const preflightKey = getWriteFileStreamingPreflightKey(fullPath, normalizedSection)
  if (state.preflightKey === preflightKey) {
    return
  }
  state.preflightKey = preflightKey
  state.sectionResolved = false
  state.fileAnchorResolved = false
  state.preflightError = undefined

  state.pending = state.pending.then(async () => {
    try {
      const isCurrentPreflight = () => state.preflightKey === preflightKey
      if (!isCurrentPreflight()) {
        return
      }

      const awaitedSectionTitle = getSectionTitleToAwait(normalizedSection)
      if (awaitedSectionTitle) {
        try {
          await awaitSectionInSandbox(sandbox, fullPath, awaitedSectionTitle, SECTION_WAIT_TIMEOUT_MS)
          if (!isCurrentPreflight()) {
            return
          }
          state.sectionResolved = true
          state.preflightError = undefined
        } catch (error) {
          if (isCurrentPreflight()) {
            state.preflightError = toRawError(error)
          }
          return
        }
      }

      if (getFileAnchorPath(normalizedSection)) {
        try {
          await resolveFileAnchorPlacementResult(sandbox, fullPath, normalizedSection)
          if (!isCurrentPreflight()) {
            return
          }
          state.fileAnchorResolved = true
          state.preflightError = undefined
        } catch (error) {
          if (isCurrentPreflight()) {
            state.preflightError = toRawError(error)
          }
          return
        }
      }

      await ensureWorkspaceParentDirectory(sandbox, fullPath)
      if (!isCurrentPreflight()) {
        return
      }

      if (state.placementPreparedPath !== fullPath) {
        await writeCanvasIntent(sandbox, fullPath, { section: normalizedSection })
        if (!isCurrentPreflight()) {
          return
        }
        state.placementPreparedPath = fullPath
      }

      if (!(await sandbox.fileExists(fullPath))) {
        if (!isCurrentPreflight()) {
          return
        }
        await sandbox.writeFile(fullPath, '')
        if (!isCurrentPreflight()) {
          return
        }
        state.placeholderPath = fullPath
      }
    } catch {
      // Streaming-time placeholder creation is best-effort. Execute-time validation remains canonical.
    }
  })
}

export function clearWriteFileStreamingState(toolCallId: string | undefined): void {
  if (!toolCallId) {
    return
  }

  writeFileStreamingStates.delete(toolCallId)
}

export async function editFileWithHarness(
  sandbox: SandboxManager,
  input: EditFileInput,
  onProgress?: ProgressCallback
): Promise<EditFileResult> {
  const fullPath = resolveAndValidateFilePath(input.path)
  if (!(await sandbox.fileExists(fullPath))) {
    throw new Error(`File not found: ${input.path}`)
  }

  onProgress?.({ streamingStatus: 'Reading file...' })
  const content = await sandbox.readFile(fullPath)
  let nextContent: string

  if (input.mode === 'replace_exact') {
    nextContent = replaceExact(content, input.old_text, input.new_text)
  } else if (input.mode === 'insert_after') {
    nextContent = insertAfter(content, input.anchor_text, input.new_text)
  } else {
    nextContent = input.new_text
  }
  nextContent = normalizeOpenAIFileToolMarkdownContent(fullPath, nextContent)

  onProgress?.({
    streamingStatus: 'Applying changes...',
    totalLines: countContentLines(nextContent),
  })

  await sandbox.writeFile(fullPath, nextContent)

  return {
    status: 'success',
    command: input.mode === 'insert_after' ? 'insert' : 'str_replace',
    path: input.path,
    message:
      input.mode === 'replace_entire'
        ? `File success: ${input.path} was rewritten.`
        : `File success: ${input.path} was edited.`,
  }
}

export async function deleteFileWithHarness(
  sandbox: SandboxManager,
  path: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const fullPath = resolveAndValidateFilePath(path)
  if (!(await sandbox.fileExists(fullPath))) {
    throw new Error(`File not found: ${path}`)
  }

  onProgress?.({ streamingStatus: 'Deleting file...' })
  await removeWorkspaceFile(sandbox, fullPath)
  return `File success: ${path} was deleted.`
}

export function createWriteFileFailure(error: unknown): FileToolFailure {
  const rawError = toRawError(error)

  if (rawError.startsWith(FILE_ALREADY_EXISTS_ERROR_PREFIX)) {
    return {
      rawError,
      userMessage: 'File already exists. Use edit_file with replace_entire to rewrite it.',
      modelMessage:
        'write_file failed because the target file already exists. Use `edit_file` with `replace_entire` to rewrite an existing file, or choose a new relative path.',
    }
  }

  if (rawError.startsWith(INVALID_SECTION_ERROR_PREFIX)) {
    return {
      rawError,
      userMessage: 'Section is invalid. Fix the section object and retry.',
      modelMessage:
        'write_file failed because `section` is missing or invalid. Use `{ mode: "create", title, layout, x, y, columns? }`, `{ mode: "create", title, layout, placement: { mode: "with_file", anchorFilePath }, columns? }`, or `{ mode: "join", title }`.',
    }
  }

  if (rawError.startsWith(SECTION_WAIT_TIMEOUT_ERROR_PREFIX)) {
    return {
      rawError,
      userMessage: 'The target section did not appear in time. Retry after the section exists.',
      modelMessage:
        'write_file failed because the requested section did not appear in the live canvas state before timeout. For `join`, `title` must be the exact existing section title, not a document/card title or Markdown heading. Retry with a valid existing section title, or use `create` to create a new section.',
    }
  }

  if (rawError.startsWith(ANCHOR_FILE_WAIT_TIMEOUT_ERROR_PREFIX)) {
    return {
      rawError,
      userMessage: 'The anchor file did not appear in time. Check the anchor path and retry.',
      modelMessage:
        'write_file failed because the requested anchor file did not appear in the live canvas state before timeout. For `placement.mode: "with_file"`, `anchorFilePath` must be the exact existing workspace-relative file path in the same canvas.',
    }
  }

  if (rawError.startsWith(FILE_ANCHOR_SECTION_TITLE_CONFLICT_ERROR_PREFIX)) {
    return {
      rawError,
      userMessage:
        'A section with that title already exists. Choose a unique section title or join the existing section.',
      modelMessage:
        'write_file failed because `placement.mode: "with_file"` would create a new section around an unsectioned anchor file, but the requested section title already exists in that canvas. Use a unique title, or use `join` with the exact existing section title.',
    }
  }

  if (rawError === UNSUPPORTED_FILE_TYPE_ERROR) {
    return {
      rawError,
      userMessage: 'This file tool only supports Markdown and YAML files. Use shell instead.',
      modelMessage:
        'write_file failed because only Markdown and YAML files are supported here. Use shell for other file types.',
    }
  }

  return {
    rawError,
    userMessage: 'File could not be written. Check the path and section, then retry.',
    modelMessage:
      'write_file failed. Confirm the relative path points to a new file, the content is valid, and the required section uses supported fields, then retry.',
  }
}

export function createEditFileFailure(error: unknown): FileToolFailure {
  const rawError = toRawError(error)
  const context = getFailureContext(error)
  const failureContext = {
    rawError,
    originalFileContent: context.originalFileContent,
  }

  if (rawError === 'Exact match not found.') {
    return {
      ...failureContext,
      userMessage:
        'Could not edit the file because the exact target text was not found. Read the file again and retry.',
      modelMessage:
        'edit_file replace_exact failed because `old_text` does not match the current file. Read the file again, copy the exact current text, and retry with a smaller unique match.',
    }
  }

  if (rawError.startsWith('Found ') && rawError.endsWith('exact matches.')) {
    return {
      ...failureContext,
      userMessage:
        'Could not edit the file because the target text matched more than one location. Make the match more specific and retry.',
      modelMessage:
        'edit_file replace_exact failed because `old_text` matched more than one location. Include more exact surrounding text so the match is unique, then retry.',
    }
  }

  if (rawError === 'Anchor text not found.') {
    return {
      ...failureContext,
      userMessage: 'Could not insert because the anchor text was not found. Read the file again and retry.',
      modelMessage:
        'edit_file insert_after failed because `anchor_text` does not match the current file. Read the file again, copy the exact current anchor text, and retry.',
    }
  }

  if (rawError.startsWith('Found ') && rawError.endsWith('matches for anchor text.')) {
    return {
      ...failureContext,
      userMessage:
        'Could not insert because the anchor text matched more than one location. Make the anchor more specific and retry.',
      modelMessage:
        'edit_file insert_after failed because `anchor_text` matched more than one location. Include more exact surrounding text so the anchor is unique, then retry.',
    }
  }

  if (rawError.startsWith('File not found:')) {
    return {
      ...failureContext,
      userMessage: 'File could not be edited because it was not found. Check the path and retry.',
      modelMessage:
        'edit_file failed because the target file was not found. Read the workspace to confirm the correct relative path inside /workspace, then retry.',
    }
  }

  if (rawError === UNSUPPORTED_FILE_TYPE_ERROR) {
    return {
      ...failureContext,
      userMessage: 'This file tool only supports Markdown and YAML files. Use shell instead.',
      modelMessage:
        'edit_file failed because only Markdown and YAML files are supported here. Use shell for other file types.',
    }
  }

  return {
    ...failureContext,
    userMessage: 'File could not be edited. Read the file again and retry.',
    modelMessage:
      'edit_file failed. Read the file again, confirm the relative path, and retry with a unique exact match or anchor.',
  }
}

export function createRepositionFilesFailure(error: unknown): FileToolFailure {
  const rawError = toRawError(error)

  if (rawError.includes(INVALID_PATH_ERROR_SUFFIX)) {
    return {
      rawError,
      userMessage: 'A reposition path is invalid. Use relative file paths inside /workspace.',
      modelMessage: rawError.startsWith('Error: ') ? rawError.slice('Error: '.length) : rawError,
    }
  }

  if (rawError.startsWith(INVALID_SECTION_ERROR_PREFIX)) {
    const detail = rawError.slice(INVALID_SECTION_ERROR_PREFIX.length).trim()
    return {
      rawError,
      userMessage: 'A reposition change is invalid. Fix the change object and retry.',
      modelMessage: `reposition_files failed because one or more inputs were invalid. ${detail || rawError} Use a single top-level \`canvas\` plus ID-based section changes: \`{ type: "update_section", sectionId, title?, layout?, columns? }\`, \`{ type: "move_files", sectionId, paths }\`, or \`{ type: "create_section", title, layout, columns?, location, paths }\`.`,
    }
  }

  if (rawError.startsWith('Duplicate path:')) {
    return {
      rawError,
      userMessage: 'Each file can only be repositioned once per tool call.',
      modelMessage: `reposition_files failed: ${rawError}. The same file path cannot appear more than once in \`changes\`.`,
    }
  }

  if (rawError.startsWith('File not found:')) {
    return {
      rawError,
      userMessage: 'A target file does not exist. Check the path and retry.',
      modelMessage: `reposition_files failed: ${rawError}. Read the current workspace structure and retry with existing file paths.`,
    }
  }

  if (rawError.startsWith('Section not found:')) {
    return {
      rawError,
      userMessage: 'A target section does not exist. Read metadata.yaml and retry with a current section ID.',
      modelMessage: `reposition_files failed: ${rawError}. Read the current metadata.yaml and retry with a valid sectionId or anchorSectionId.`,
    }
  }

  if (rawError.startsWith('Section already exists:')) {
    return {
      rawError,
      userMessage: 'A section with that title already exists. Choose a unique title.',
      modelMessage: `reposition_files failed: ${rawError}. Choose a unique title or update the existing section by sectionId.`,
    }
  }

  if (rawError.startsWith('File belongs to a different canvas:')) {
    return {
      rawError,
      userMessage: 'A target file is outside the requested canvas.',
      modelMessage: `reposition_files failed: ${rawError}. All file paths in move_files/create_section must belong to the top-level \`canvas\`.`,
    }
  }

  if (rawError.startsWith('Canvas not found:') || rawError.startsWith('Canvas metadata not found:')) {
    return {
      rawError,
      userMessage: 'A target canvas does not exist or is missing metadata. Check the canvas path and retry.',
      modelMessage: `reposition_files failed: ${rawError}. Use a canvas path that exists and contains metadata.yaml.`,
    }
  }

  if (rawError.startsWith('Path is a directory:')) {
    return {
      rawError,
      userMessage: 'Repositioning only works for files, not directories.',
      modelMessage: `reposition_files failed: ${rawError}. Use existing file paths, not directory paths.`,
    }
  }

  if (rawError === UNSUPPORTED_FILE_TYPE_ERROR) {
    return {
      rawError,
      userMessage: 'This file cannot be repositioned with this tool.',
      modelMessage: `reposition_files failed: ${rawError}. Use an existing Markdown, YAML, or image file path.`,
    }
  }

  return {
    rawError,
    userMessage: 'Repositioning failed. Check the file paths, canvas paths, and section changes, then retry.',
    modelMessage: `reposition_files failed: ${rawError}. Confirm every canvas path, sectionId, file path, and layout field follows the supported ID-based schema, then retry.`,
  }
}

export function getRepositionFilesPreview(input: RepositionFilesInput): RepositionFilesPreview {
  const paths = input.changes
    .flatMap((change) => {
      if (change.type === 'move_files' || change.type === 'create_section') {
        return change.paths
      }

      if (change.type === 'update_section') {
        return [input.canvas]
      }

      return []
    })
    .filter((path): path is string => typeof path === 'string')
  const uniquePaths = paths.filter((path, index, array) => array.indexOf(path) === index)

  return {
    paths: uniquePaths,
    count: uniquePaths.length,
  }
}

export function createDeleteFileFailure(error: unknown): FileToolFailure {
  const rawError = toRawError(error)

  if (rawError.startsWith('File not found:')) {
    return {
      rawError,
      userMessage: 'File could not be deleted because it was not found. Check the path and retry.',
      modelMessage:
        'delete_file failed because the target file was not found. Read the workspace to confirm the correct relative path inside /workspace, then retry.',
    }
  }

  if (rawError === UNSUPPORTED_FILE_TYPE_ERROR) {
    return {
      rawError,
      userMessage: 'This file tool only supports Markdown and YAML files. Use shell instead.',
      modelMessage:
        'delete_file failed because only Markdown and YAML files are supported here. Use shell for other file types.',
    }
  }

  return {
    rawError,
    userMessage: 'File could not be deleted. Check the path and retry.',
    modelMessage: 'delete_file failed. Confirm the relative path inside /workspace and retry.',
  }
}

function replaceExact(content: string, oldText: string, newText: string): string {
  if (!oldText) {
    throw new Error('Exact match not found.')
  }

  const matchCount = countExactMatches(content, oldText)
  if (matchCount === 0) {
    throw new FileToolExecutionError('Exact match not found.', {
      originalFileContent: content,
    })
  }
  if (matchCount > 1) {
    throw new FileToolExecutionError(`Found ${matchCount} exact matches.`, {
      originalFileContent: content,
    })
  }

  return content.replace(oldText, newText)
}

function insertAfter(content: string, anchorText: string, newText: string): string {
  if (!anchorText) {
    throw new Error('Anchor text not found.')
  }

  const matchCount = countExactMatches(content, anchorText)
  if (matchCount === 0) {
    throw new FileToolExecutionError('Anchor text not found.', {
      originalFileContent: content,
    })
  }
  if (matchCount > 1) {
    throw new FileToolExecutionError(`Found ${matchCount} matches for anchor text.`, {
      originalFileContent: content,
    })
  }

  const anchorIndex = content.indexOf(anchorText)
  return `${content.slice(0, anchorIndex + anchorText.length)}${newText}${content.slice(anchorIndex + anchorText.length)}`
}

function countExactMatches(content: string, target: string): number {
  if (!target) {
    return 0
  }

  let count = 0
  let offset = 0
  while (offset <= content.length) {
    const index = content.indexOf(target, offset)
    if (index === -1) {
      break
    }
    count += 1
    offset = index + target.length
  }

  return count
}

function resolveAndValidateFilePath(path: string): string {
  const fullPath = resolveWorkspaceFilePath(path)
  if (!fullPath || path.startsWith('/')) {
    throw new Error(`Invalid path: ${path}`)
  }

  const fileCheck = isAllowedFileType(fullPath)
  if (!fileCheck.allowed || fileCheck.isImage) {
    throw new Error(UNSUPPORTED_FILE_TYPE_ERROR)
  }

  return fullPath
}

function validateSection(section: FileSectionInput | undefined): FileSection {
  const parsedSection = section ? parseFileSection(section) : null
  if (!parsedSection) {
    throw new Error(
      `${INVALID_SECTION_ERROR_PREFIX} section must be { mode: "create", title, layout, x, y, columns? }, { mode: "create", title, layout, placement: { mode, anchorSectionTitle, gap? }, columns? }, { mode: "create", title, layout, placement: { mode: "with_file", anchorFilePath }, columns? }, or { mode: "join", title }.`
    )
  }

  return parsedSection
}

function validateWriteFileSection(section: FileSectionInput | undefined): FileSection {
  if (!section) {
    throw new Error(`${INVALID_SECTION_ERROR_PREFIX} write_file requires a section object.`)
  }

  return validateSection(section)
}

function resolveAndValidateRepositionFilePath(path: string): string {
  const fullPath = resolveWorkspaceFilePath(path)
  if (!fullPath || path.startsWith('/')) {
    throw new Error(`Invalid path: ${path}`)
  }

  const fileCheck = isAllowedFileType(fullPath)
  if (!fileCheck.allowed) {
    throw new Error(UNSUPPORTED_FILE_TYPE_ERROR)
  }

  return fullPath
}

function resolveAndValidateCanvasPath(path: string): string {
  const fullPath = resolveWorkspacePath(path)
  if (!fullPath || fullPath === WORKSPACE_ROOT || path.startsWith('/')) {
    throw new Error(`Invalid path: ${path}`)
  }

  return fullPath
}

function tryResolveWriteFilePath(path: string): string | null {
  try {
    return resolveAndValidateFilePath(path)
  } catch {
    return null
  }
}

async function runSandboxCommand(sandbox: SandboxManager, command: string, errorMessage: string): Promise<void> {
  const result = await sandbox.exec(command, { cwd: WORKSPACE_ROOT })
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()

  if (result.exitCode !== 0) {
    throw new Error(output || errorMessage)
  }
}

async function ensureWorkspaceParentDirectory(sandbox: SandboxManager, filePath: string): Promise<void> {
  const directory = pathPosix.dirname(filePath)
  await runSandboxCommand(sandbox, `mkdir -p ${shellQuote(directory)}`, `Failed to create directory: ${directory}`)
}

async function ensurePlacementParentDirectory(sandbox: SandboxManager, filePath: string): Promise<void> {
  const directory = pathPosix.dirname(getPlacementIntentPath(filePath))
  await runSandboxCommand(sandbox, `mkdir -p ${shellQuote(directory)}`, `Failed to create directory: ${directory}`)
}

async function writeCanvasIntent(
  sandbox: SandboxManager,
  filePath: string,
  intent: { section: FileSection }
): Promise<void> {
  await ensurePlacementParentDirectory(sandbox, filePath)
  await sandbox.writeFile(getPlacementIntentPath(filePath), JSON.stringify(intent))
}

function getPlacementIntentPath(filePath: string): string {
  const relativePath = pathPosix.relative(WORKSPACE_ROOT, filePath)
  return pathPosix.join(PLACEMENT_ROOT, `${relativePath}.json`)
}

function getSectionTitleToAwait(section: FileSection): string | null {
  if (section.mode === 'join') {
    return section.title
  }

  if ('placement' in section && section.placement.mode !== 'with_file') {
    return section.placement.anchorSectionTitle
  }

  return null
}

function getFileAnchorPath(section: FileSection): string | null {
  if (section.mode !== 'create' || !('placement' in section) || section.placement.mode !== 'with_file') {
    return null
  }

  return section.placement.anchorFilePath
}

async function querySectionInSandbox(
  sandbox: SandboxManager,
  filePath: string,
  title: string,
  timeoutMs: number
): Promise<boolean> {
  const command = buildAwaitSectionCommand(filePath, title, timeoutMs)
  const result = await sandbox.exec(command, { cwd: WORKSPACE_ROOT, timeoutMs: timeoutMs + 1_000 })
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()

  if (result.exitCode !== 0) {
    throw new Error(output || 'Failed to query live sandbox section state.')
  }

  let parsed: { ok?: boolean; exists?: boolean; error?: string }
  try {
    parsed = JSON.parse(result.stdout) as { ok?: boolean; exists?: boolean; error?: string }
  } catch {
    throw new Error('Failed to parse live sandbox section state response.')
  }

  if (parsed.ok !== true) {
    throw new Error(parsed.error || 'Failed to query live sandbox section state.')
  }

  return parsed.exists === true
}

async function queryFileAnchorPlacementInSandbox(
  sandbox: SandboxManager,
  targetFilePath: string,
  anchorFilePath: string,
  fallbackSectionTitle: string,
  timeoutMs: number
): Promise<LiveFileAnchorPlacement> {
  const command = buildResolveFileAnchorPlacementCommand(
    targetFilePath,
    anchorFilePath,
    fallbackSectionTitle,
    timeoutMs
  )
  const result = await sandbox.exec(command, { cwd: WORKSPACE_ROOT, timeoutMs: timeoutMs + 1_000 })
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()

  if (result.exitCode !== 0) {
    throw new Error(output || 'Failed to resolve live sandbox file-anchor placement.')
  }

  let parsed: {
    ok?: boolean
    exists?: boolean
    destinationSectionTitle?: string | null
    createsSectionTitle?: string | null
    error?: string
  }
  try {
    parsed = JSON.parse(result.stdout) as {
      ok?: boolean
      exists?: boolean
      destinationSectionTitle?: string | null
      createsSectionTitle?: string | null
      error?: string
    }
  } catch {
    throw new Error('Failed to parse live sandbox file-anchor placement response.')
  }

  if (parsed.ok !== true) {
    throw new Error(parsed.error || 'Failed to resolve live sandbox file-anchor placement.')
  }

  return {
    exists: parsed.exists === true,
    destinationSectionTitle: typeof parsed.destinationSectionTitle === 'string' ? parsed.destinationSectionTitle : null,
    createsSectionTitle: typeof parsed.createsSectionTitle === 'string' ? parsed.createsSectionTitle : null,
  }
}

async function awaitSectionInSandbox(
  sandbox: SandboxManager,
  filePath: string,
  title: string,
  timeoutMs: number
): Promise<void> {
  if (!(await querySectionInSandbox(sandbox, filePath, title, timeoutMs))) {
    throw new Error(`${SECTION_WAIT_TIMEOUT_ERROR_PREFIX} ${title}`)
  }
}

export function buildResolveFileAnchorPlacementCommand(
  targetFilePath: string,
  anchorFilePath: string,
  fallbackSectionTitle: string,
  timeoutMs: number
): string {
  const payload = JSON.stringify({
    targetRelativePath: pathPosix.relative(WORKSPACE_ROOT, targetFilePath),
    anchorFilePath,
    fallbackSectionTitle,
    timeoutMs,
  })
  const script = [
    `const payload = ${JSON.stringify(payload)}`,
    `const url = ${JSON.stringify(`http://127.0.0.1:${LIVE_STATE_SERVER_PORT}/file-anchor/resolve`)}`,
    'const main = async () => {',
    '  const response = await fetch(url, {',
    '    method: "POST",',
    '    headers: { "content-type": "application/json" },',
    '    body: payload,',
    '  })',
    '  const text = await response.text()',
    '  if (!response.ok) {',
    '    process.stderr.write(text)',
    '    process.exit(1)',
    '  }',
    '  process.stdout.write(text)',
    '}',
    'main().catch((error) => { process.stderr.write(error instanceof Error ? error.message : String(error)); process.exit(1) })',
  ].join('\n')

  return `node <<'EOF'\n${script}\nEOF`
}

export function buildAwaitSectionCommand(filePath: string, title: string, timeoutMs: number): string {
  const payload = JSON.stringify({
    relativePath: pathPosix.relative(WORKSPACE_ROOT, filePath),
    title,
    timeoutMs,
  })
  const script = [
    `const payload = ${JSON.stringify(payload)}`,
    `const url = ${JSON.stringify(`http://127.0.0.1:${LIVE_STATE_SERVER_PORT}/sections/wait`)}`,
    'const main = async () => {',
    '  const response = await fetch(url, {',
    '    method: "POST",',
    '    headers: { "content-type": "application/json" },',
    '    body: payload,',
    '  })',
    '  const text = await response.text()',
    '  if (!response.ok) {',
    '    process.stderr.write(text)',
    '    process.exit(1)',
    '  }',
    '  process.stdout.write(text)',
    '}',
    'main().catch((error) => { process.stderr.write(error instanceof Error ? error.message : String(error)); process.exit(1) })',
  ].join('\n')

  return `node <<'EOF'\n${script}\nEOF`
}

async function removeWorkspaceFile(sandbox: SandboxManager, filePath: string): Promise<void> {
  await runSandboxCommand(sandbox, `rm -f ${shellQuote(filePath)}`, `Failed to remove file: ${filePath}`)
}

async function cleanupEmptyWriteFilePlaceholder(sandbox: SandboxManager, filePath: string): Promise<void> {
  try {
    if (!(await sandbox.fileExists(filePath))) {
      return
    }

    const content = await sandbox.readFile(filePath)
    if (content.length > 0) {
      return
    }

    await removeWorkspaceFile(sandbox, filePath)
  } catch {
    // Best-effort cleanup only. Preserve the original write failure.
  }
}

async function cleanupCanvasIntent(sandbox: SandboxManager, filePath: string): Promise<void> {
  try {
    const placementPath = getPlacementIntentPath(filePath)
    if (!(await sandbox.fileExists(placementPath))) {
      return
    }

    await runSandboxCommand(
      sandbox,
      `rm -f ${shellQuote(placementPath)}`,
      `Failed to remove placement intent: ${placementPath}`
    )
  } catch {
    // Best-effort cleanup only. Preserve the original write failure.
  }
}

function getFailureContext(error: unknown): FileToolFailureContext {
  if (!(error instanceof Error)) {
    return {}
  }

  const context = error as Error & FileToolFailureContext
  return {
    originalFileContent: typeof context.originalFileContent === 'string' ? context.originalFileContent : undefined,
  }
}

function tryParseStreamingWriteFileBootstrapInput(
  input: string | WriteFileInput
): Pick<WriteFileInput, 'path' | 'section'> | null {
  if (typeof input !== 'string') {
    return typeof input.path === 'string' && input.section ? { path: input.path, section: input.section } : null
  }

  const path = extractJsonStringField(input, 'path')
  const section = extractJsonObjectField<FileSectionInput>(input, 'section')
  if (!path || !section) {
    return null
  }

  return { path, section }
}

function getOrCreateWriteFileStreamingState(toolCallId: string): WriteFileStreamingState {
  let state = writeFileStreamingStates.get(toolCallId)
  if (!state) {
    state = {
      pending: Promise.resolve(),
    }
    writeFileStreamingStates.set(toolCallId, state)
  }

  return state
}

function getWriteFileStreamingPreflightKey(filePath: string, section: FileSection): string {
  return `${filePath}\n${JSON.stringify(section)}`
}

async function getWriteFileStreamingState(toolCallId: string | undefined): Promise<WriteFileStreamingState | null> {
  if (!toolCallId) {
    return null
  }

  const state = writeFileStreamingStates.get(toolCallId)
  if (!state) {
    return null
  }

  await state.pending
  return writeFileStreamingStates.get(toolCallId) ?? null
}

function toRawError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function normalizeOpenAIFileToolMarkdownContent(path: string, content: string): string {
  if (!path.toLowerCase().endsWith('.md')) {
    return content
  }

  return normalizeMarkdownSpacingArtifacts(content)
}

export function normalizeMarkdownSpacingArtifacts(content: string): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let fence: MarkdownFence | null = null
  let blankRun = 0

  for (const line of lines) {
    if (fence) {
      output.push(line)
      if (isMarkdownFenceEnd(line, fence)) {
        fence = null
      }
      blankRun = 0
      continue
    }

    const fenceStart = getMarkdownFenceStart(line)
    if (fenceStart) {
      output.push(line)
      fence = fenceStart
      blankRun = 0
      continue
    }

    if (line.trim() === '\\') {
      continue
    }

    if (line.trim() === '') {
      blankRun += 1
      if (blankRun <= 1) {
        output.push('')
      }
      continue
    }

    output.push(line)
    blankRun = 0
  }

  return output.join('\n')
}

function getMarkdownFenceStart(line: string): MarkdownFence | null {
  const match = /^(?: {0,3})(`{3,}|~{3,})/.exec(line)
  if (!match) {
    return null
  }

  const marker = match[1]
  return { marker: marker[0] as MarkdownFence['marker'], length: marker.length }
}

function isMarkdownFenceEnd(line: string, fence: MarkdownFence): boolean {
  const match = /^(?: {0,3})(`{3,}|~{3,})\s*$/.exec(line)
  if (!match) {
    return false
  }

  const marker = match[1]
  return marker[0] === fence.marker && marker.length >= fence.length
}

function countContentLines(content: string): number {
  if (!content) {
    return 0
  }

  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content
  return normalized ? normalized.split('\n').length : 1
}
