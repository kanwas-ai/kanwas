export const AGENT_MODES = ['thinking', 'direct'] as const

export type AgentMode = (typeof AGENT_MODES)[number]

export const DEFAULT_AGENT_MODE: AgentMode = 'thinking'

export function normalizeAgentMode(value: unknown): AgentMode {
  return AGENT_MODES.includes(value as AgentMode) ? (value as AgentMode) : DEFAULT_AGENT_MODE
}
