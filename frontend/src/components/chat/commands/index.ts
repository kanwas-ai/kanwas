export interface CommandContext {
  workspaceId: string
  sendMessage?: (message: string) => void
  startNewTask?: () => void | Promise<void>
  focusInput?: () => void
}

export interface SlashCommand {
  name: string
  description: string
  /** If true, command executes immediately on Enter. If false, Tab inserts text for editing. */
  immediate?: boolean
  /** For immediate commands, the handler to execute */
  handler?: (ctx: CommandContext) => void | Promise<void>
  /** For non-immediate commands, the text to insert (user then presses Enter to submit) */
  insertText?: string
}

export const slashCommands: SlashCommand[] = [
  {
    name: 'new',
    description: 'Start a new task',
    immediate: true,
    handler: async (ctx) => {
      await ctx.startNewTask?.()
      ctx.focusInput?.()
    },
  },
]
