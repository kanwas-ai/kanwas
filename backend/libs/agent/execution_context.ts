import type { Context } from './types.js'

export function buildContextSection(context: Context): string {
  const sections: string[] = []
  const activeCanvasContext = context.activeCanvasContext?.trim() || null
  const userName = context.userName?.trim() || null

  if (userName) {
    sections.push(`<user_context>\nUser name: ${escapePromptTagContent(userName)}\n</user_context>`)
  }

  if (
    (context.canvasId && !activeCanvasContext) ||
    context.selectedText ||
    (context.selectedNodePaths && context.selectedNodePaths.length > 0) ||
    (context.mentionedNodePaths && context.mentionedNodePaths.length > 0)
  ) {
    const uiParts: string[] = []

    if (context.canvasId && !activeCanvasContext && context.canvasPath !== null && context.canvasPath !== undefined) {
      const displayPath = context.canvasPath === '' ? '/workspace/' : `/workspace/${context.canvasPath}/`
      uiParts.push(`Active canvas: ${displayPath}`)
    }

    if (context.selectedText) {
      uiParts.push(
        `Selected text from "${context.selectedText.nodeName}":\n\`\`\`\n${context.selectedText.text}\n\`\`\``
      )
    }

    if (context.selectedNodePaths && context.selectedNodePaths.length > 0) {
      const nodeList = context.selectedNodePaths.map((path) => `- /workspace/${path}`).join('\n')
      uiParts.push(`Selected nodes:\n${nodeList}`)
    }

    if (context.mentionedNodePaths && context.mentionedNodePaths.length > 0) {
      const nodeList = context.mentionedNodePaths.map((path) => `- /workspace/${path}`).join('\n')
      uiParts.push(`Mentioned documents:\n${nodeList}`)
    }

    if (uiParts.length > 0) {
      sections.push(`<ui_context>\n${uiParts.join('\n')}\n</ui_context>`)
    }
  }

  if (activeCanvasContext) {
    sections.push(`<active_canvas_context>\n${escapePromptTagContent(activeCanvasContext)}\n</active_canvas_context>`)
  }

  if (context.connectedExternalToolsLookupCompleted) {
    sections.push(buildConnectedExternalToolsSection(context.connectedExternalTools || []))
  }

  if (context.workspaceTree) {
    sections.push(`<workspace_structure>\n${context.workspaceTree}\n</workspace_structure>`)
  }

  return sections.length > 0 ? sections.join('\n\n') : ''
}

function buildConnectedExternalToolsSection(tools: NonNullable<Context['connectedExternalTools']>): string {
  const toolLines = tools
    .map((tool) => (tool.displayName || tool.toolkit).trim())
    .filter((displayName) => displayName.length > 0)
    .map((displayName) => `- ${escapePromptTagContent(displayName)}`)

  const body = toolLines.length > 0 ? toolLines.join('\n') : 'No external tools are connected'

  return `<connected_external_tools>\n${body}\n</connected_external_tools>`
}

function escapePromptTagContent(content: string): string {
  return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildWorkingContextCanvasPath(context: Context): string | null {
  if (!context.canvasId || context.canvasPath === null || context.canvasPath === undefined) {
    return null
  }

  return context.canvasPath === '' ? '/workspace/' : `/workspace/${context.canvasPath}/`
}
