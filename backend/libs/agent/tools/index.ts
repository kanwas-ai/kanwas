// tools/index.ts

// ============================================================================
// Context Exports
// ============================================================================

export type { ToolContext } from './context.js'
export { getToolContext, hasToolContext } from './context.js'

// ============================================================================
// Native Tools Factory
// ============================================================================

export { createNativeTools } from './native.js'

// ============================================================================
// Individual Tool Exports (Vercel AI SDK format)
// ============================================================================

export { progressTool } from './progress.js'
export { chatTool } from './chat.js'
export { startTaskTool } from './start_task.js'
export { webSearchTool } from './web_search.js'
export { webFetchTool } from './web_fetch.js'
export { createSkillTool as createSkillInvokeTool, getSkillToolDescription } from './skill.js'
export { createSkillTool } from './create_skill.js'
export { askQuestionTool } from './ask_question.js'
export { contextualTipTool } from './contextual_tip.js'
export {
  SUGGEST_NEXT_TASKS_TOOL_NAME,
  suggestNextTasksTool,
  suggestNextTasksToolInputSchema,
} from './suggest_next_tasks.js'

// ============================================================================
// Grouped Tool Exports (for generateText tools parameter)
// ============================================================================

// Note: chatTool removed from main agent - using extended thinking + text output
// thinkTool deleted entirely - all agents now use extended thinking
import { progressTool } from './progress.js'
import { startTaskTool } from './start_task.js'
import { webSearchTool } from './web_search.js'
import { webFetchTool } from './web_fetch.js'
import { askQuestionTool } from './ask_question.js'
import { contextualTipTool } from './contextual_tip.js'

/** Core tools - always visible to Claude (NOT deferred)
 * Note: think/chat removed - all agents use extended thinking + text output
 */
export const coreTools = {
  progress: progressTool,
  start_task: startTaskTool,
}

/** Utility tools - research and guidance */
export const utilityTools = {
  web_search: webSearchTool,
  web_fetch: webFetchTool,
  ask_question: askQuestionTool,
  contextual_tip: contextualTipTool,
}

// ============================================================================
// Tool Categories
// ============================================================================

export const TOOL_CATEGORIES = {
  core: ['progress', 'start_task'] as const,
  native: [
    'bash',
    'str_replace_based_edit_tool',
    'shell',
    'read_file',
    'write_file',
    'edit_file',
    'delete_file',
    'reposition_files',
  ] as const,
  utility: ['web_search', 'web_fetch', 'ask_question', 'contextual_tip'] as const,
} as const
