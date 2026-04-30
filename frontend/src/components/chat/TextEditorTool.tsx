import type { ReactNode } from 'react'
import type { TextEditorItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useWorkspaceSnapshot } from '@/providers/workspace'
import { resolveWorkspacePath } from '@/lib/workspaceUtils'
import type { CanvasItem } from 'shared'
import { SubagentBadge } from './SubagentBadge'

interface TextEditorToolProps {
  item: DeepReadonly<TextEditorItem>
  onNodeSelect?: (nodeId: string, canvasId: string) => void
  /** True when path/command is still streaming from LLM */
  streaming?: boolean
}

type EditorCommand = TextEditorItem['command']

const filenameClassName = 'min-w-0 shrink truncate text-chat-link font-medium'
const canvasStructureReadLabel = 'Reading canvas structure'
const workspaceRootLabel = 'workspace'

const commandConfig: Record<EditorCommand, { isRead: boolean; verb: string }> = {
  view: { isRead: true, verb: 'Read' },
  create: { isRead: false, verb: 'Write' },
  str_replace: { isRead: false, verb: 'Edit' },
  insert: { isRead: false, verb: 'Edit' },
  delete: { isRead: false, verb: 'Delete' },
}

function formatFilePath(path: string): { dir: string; filename: string } {
  const segments = path.split('/')
  const filename = segments.pop() || path
  const dir = segments.length > 2 ? '.../' + segments.slice(-2).join('/') : segments.join('/')
  return { dir, filename }
}

function isCanvasMetadataRead(item: DeepReadonly<TextEditorItem>) {
  return item.command === 'view' && item.path.endsWith('metadata.yaml')
}

type SemanticYamlNodeLabel = {
  target: string
  folder: string
}

const semanticYamlNodeTypes = [
  { suffix: '.sticky.yaml', label: 'sticky note' },
  { suffix: '.url.yaml', label: 'link' },
] as const

function isSemanticYamlNodeCommand(command: TextEditorItem['command']) {
  return command === 'view' || command === 'create' || command === 'str_replace' || command === 'insert'
}

function getSemanticYamlNodeLabel(item: DeepReadonly<TextEditorItem>): SemanticYamlNodeLabel | null {
  if (!isSemanticYamlNodeCommand(item.command)) {
    return null
  }

  const normalizedPath = item.path.replace(/\\/g, '/')
  const nodeType = semanticYamlNodeTypes.find((type) => normalizedPath.endsWith(type.suffix))
  if (!nodeType) {
    return null
  }

  const rawSegments = normalizedPath.split('/').filter(Boolean)
  if (rawSegments.length === 0) {
    return null
  }

  const workspaceSegments = rawSegments[0] === workspaceRootLabel ? rawSegments.slice(1) : rawSegments
  const filename = workspaceSegments.at(-1) ?? rawSegments.at(-1)
  if (!filename) {
    return null
  }

  const nodeName = filename.slice(0, -nodeType.suffix.length).trim()
  const folder = workspaceSegments.slice(0, -1).at(-1)?.trim() || workspaceRootLabel
  const target = nodeName ? `${nodeType.label} "${nodeName}"` : nodeType.label

  return { target, folder }
}

function SemanticYamlNodeFolderSuffix({ folder }: { folder: string }) {
  return <span className="ml-1 max-w-[9rem] truncate text-chat-pill-text"> in {folder}</span>
}

function CanvasStructureReadLabel({ active }: { active: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full overflow-hidden ${active ? 'animate-shimmer' : ''}`}
      title={`Read ${canvasStructureReadLabel}`}
    >
      <i className="fa-solid fa-eye w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
      <FilePathLabel
        verb="Read"
        dir=""
        filename={<span className={filenameClassName}>{canvasStructureReadLabel}</span>}
      />
    </div>
  )
}

interface FilePathLabelProps {
  verb: string
  dir: string
  filename: ReactNode
  details?: string | null
  suffix?: ReactNode
}

function FilePathLabel({ verb, dir, filename, details, suffix }: FilePathLabelProps) {
  return (
    <span className="min-w-0 flex-1 overflow-hidden">
      <span className="flex min-w-0 max-w-full items-baseline overflow-hidden whitespace-nowrap">
        <span className="shrink-0">{verb}&nbsp;</span>
        <span className="min-w-0 flex flex-1 items-baseline overflow-hidden">
          {dir && <span className="min-w-0 basis-0 grow truncate text-chat-pill-text">{dir}/</span>}
          {filename}
          {suffix && <span className="shrink-0">{suffix}</span>}
        </span>
        {details && <span className="ml-1 shrink-0 whitespace-nowrap text-chat-pill-text">({details})</span>}
      </span>
    </span>
  )
}

export function TextEditorTool({ item, onNodeSelect, streaming }: TextEditorToolProps) {
  const snapshot = useWorkspaceSnapshot()
  const config = commandConfig[item.command] || { isRead: true, verb: 'Reading' }
  const { dir, filename } = formatFilePath(item.path || '')
  const isExecuting = item.status === 'executing'
  const isViewCommand = item.command === 'view'
  const isCanvasStructureCheck = isCanvasMetadataRead(item)
  const semanticYamlNodeLabel = getSemanticYamlNodeLabel(item)

  // Streaming state - path/command still being typed by LLM
  if (streaming) {
    // Show generic "Working on file..." if we don't have enough info yet
    if (!item.path) {
      return (
        <div className="inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full overflow-hidden animate-shimmer">
          <i className="fa-solid fa-file w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
          <span className="min-w-[100px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            Working on file
            <span className="animate-pulse">|</span>
          </span>
        </div>
      )
    }

    if (isCanvasStructureCheck) {
      return <CanvasStructureReadLabel active />
    }

    if (semanticYamlNodeLabel) {
      return (
        <div
          className="inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full overflow-hidden animate-shimmer"
          title={`${config.verb} ${semanticYamlNodeLabel.target} in ${semanticYamlNodeLabel.folder}`}
        >
          {config.isRead ? (
            <i className="fa-solid fa-eye w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
          ) : (
            <i className="fa-solid fa-pen w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
          )}
          <FilePathLabel
            verb={config.verb}
            dir=""
            filename={<span className={filenameClassName}>{semanticYamlNodeLabel.target}</span>}
            suffix={<SemanticYamlNodeFolderSuffix folder={semanticYamlNodeLabel.folder} />}
          />
        </div>
      )
    }

    const streamingTitle = `${config.verb} ${item.path}${item.totalLines ? ` (${item.totalLines} lines)` : ''}`
    return (
      <div
        className="inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full overflow-hidden animate-shimmer"
        title={streamingTitle}
      >
        {config.isRead ? (
          <i className="fa-solid fa-eye w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
        ) : (
          <i className="fa-solid fa-pen w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
        )}
        <FilePathLabel
          verb={config.verb}
          dir={dir}
          filename={<span className={filenameClassName}>{filename}</span>}
          suffix={<span className="animate-pulse">|</span>}
          details={item.totalLines ? `${item.totalLines} lines` : null}
        />
      </div>
    )
  }

  if (isCanvasStructureCheck) {
    return <CanvasStructureReadLabel active={isExecuting} />
  }

  // Resolve path to node/canvas IDs from frontend store
  const resolved = snapshot.root ? resolveWorkspacePath(snapshot.root as CanvasItem, item.path) : null
  const isClickable = resolved && onNodeSelect

  const handleClick = () => {
    if (resolved && onNodeSelect) {
      onNodeSelect(resolved.nodeId, resolved.canvasId)
    }
  }

  // Failed state
  if (item.status === 'failed') {
    const failedTitle = semanticYamlNodeLabel
      ? `${config.verb} ${semanticYamlNodeLabel.target} in ${semanticYamlNodeLabel.folder} failed`
      : `${config.verb} ${item.path} failed`
    return (
      <div className="space-y-1">
        <div
          className="inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full overflow-hidden"
          title={failedTitle}
        >
          {config.isRead ? (
            <i className="fa-solid fa-eye w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
          ) : (
            <i className="fa-solid fa-pen w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
          )}
          <FilePathLabel
            verb={config.verb}
            dir={semanticYamlNodeLabel ? '' : dir}
            filename={
              semanticYamlNodeLabel ? (
                <span className="min-w-0 shrink truncate text-status-error">{semanticYamlNodeLabel.target}</span>
              ) : (
                <span className="min-w-0 shrink truncate text-status-error">{filename}</span>
              )
            }
            suffix={
              semanticYamlNodeLabel ? (
                <>
                  <SemanticYamlNodeFolderSuffix folder={semanticYamlNodeLabel.folder} />
                  <span className="ml-1 text-status-error"> failed</span>
                </>
              ) : (
                <span className="ml-1 text-status-error">failed</span>
              )
            }
          />
          {item.agent?.source === 'subagent' && <SubagentBadge />}
        </div>
        {item.error && <div className="ml-6 text-xs text-status-error">{item.error}</div>}
      </div>
    )
  }

  // Build details string (line count for completed reads, streaming status for executing)
  const getDetails = () => {
    if (isViewCommand) {
      if (isExecuting && item.streamingStatus) {
        return item.streamingStatus
      }

      // Show view range if specific range was requested, otherwise total lines
      if (!isExecuting && item.viewRange) {
        return `lines ${item.viewRange[0]}-${item.viewRange[1]}`
      }

      if (item.totalLines) {
        return `${item.totalLines} lines`
      }

      return null
    }

    // For write/edit commands, only show line counts (never verbose progress text).
    if (item.totalLines) {
      return `${item.totalLines} lines`
    }

    return null
  }

  const details = getDetails()

  if (semanticYamlNodeLabel) {
    const semanticFilename =
      isClickable && !isExecuting ? (
        <button
          type="button"
          onClick={handleClick}
          className={`${filenameClassName} max-w-full cursor-pointer text-left hover:underline`}
        >
          {semanticYamlNodeLabel.target}
        </button>
      ) : (
        <span className={filenameClassName}>{semanticYamlNodeLabel.target}</span>
      )

    return (
      <div
        className={`inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full overflow-hidden ${isExecuting ? 'animate-shimmer' : ''}`}
        title={`${config.verb} ${semanticYamlNodeLabel.target} in ${semanticYamlNodeLabel.folder}`}
      >
        {config.isRead ? (
          <i className="fa-solid fa-eye w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
        ) : (
          <i className="fa-solid fa-pen w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
        )}
        <FilePathLabel
          verb={config.verb}
          dir=""
          filename={semanticFilename}
          suffix={<SemanticYamlNodeFolderSuffix folder={semanticYamlNodeLabel.folder} />}
        />
        {item.agent?.source === 'subagent' && <SubagentBadge />}
      </div>
    )
  }

  // Build full display text for title attribute
  const fullText = `${config.verb} ${item.path}${details ? ` (${details})` : ''}`

  return (
    <div
      className={`inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full overflow-hidden ${isExecuting ? 'animate-shimmer' : ''}`}
      title={fullText}
    >
      {config.isRead ? (
        <i className="fa-solid fa-eye w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
      ) : (
        <i className="fa-solid fa-pen w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
      )}
      <FilePathLabel
        verb={config.verb}
        dir={dir}
        filename={
          isClickable && !isExecuting ? (
            <button
              type="button"
              onClick={handleClick}
              className={`${filenameClassName} max-w-full cursor-pointer text-left hover:underline`}
            >
              {filename}
            </button>
          ) : (
            <span className={filenameClassName}>{filename}</span>
          )
        }
        details={details}
      />
      {item.agent?.source === 'subagent' && <SubagentBadge />}
    </div>
  )
}
