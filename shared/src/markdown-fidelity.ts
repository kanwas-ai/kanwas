// Browser-safe markdown fidelity export for frontend/runtime usage.
// Pure functions over strings/JSON only — no @blocknote/server-util, no Node built-ins.

export {
  escapeInlineHtmlForImport,
  collapseHardBreakRunsInBlocks,
  postProcessExportedMarkdown,
} from './workspace/markdown-fidelity.js'
