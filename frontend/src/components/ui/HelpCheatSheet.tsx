import { memo } from 'react'
import { Modal, ModalContent } from './Modal'

interface HelpCheatSheetProps {
  isOpen: boolean
  onClose: () => void
}

export const HelpCheatSheet = memo(function HelpCheatSheet({ isOpen, onClose }: HelpCheatSheetProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalContent maxWidth="xl">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-outline/50">
          <h2 className="text-base font-semibold text-foreground">Cheat Sheet</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md hover:bg-block-highlight flex items-center justify-center text-foreground-muted hover:text-foreground transition-colors"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Content */}
        <div className="px-8 py-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-x-14 gap-y-8">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Shortcuts */}
              <Section icon="fa-keyboard" title="Shortcuts">
                <div className="space-y-2">
                  <ShortcutRow keys={['S']} action="Search" />
                  <ShortcutRow keys={['Cmd', 'Z']} action="Undo" />
                  <ShortcutRow keys={['Shift', 'Cmd', 'Z']} action="Redo" />
                  <ShortcutRow keys={['F']} action="Toggle fullscreen" />
                  <ShortcutRow keys={['0']} action="Reset zoom" />
                  <ShortcutRow keys={['Arrows']} action="Navigate nodes" />
                  <ShortcutRow keys={['Esc']} action="Stop agent" />
                </div>
              </Section>

              {/* Commands */}
              <Section icon="fa-terminal" title="Commands">
                <div className="space-y-2">
                  <CommandRow command="/new" action="New task" />
                  <CommandRow command="/skill" action="Run a skill" />
                  <CommandRow command="@" action="Mention doc or folder" />
                </div>
              </Section>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Workspace Memory */}
              <Section icon="fa-brain" title="Workspace Memory">
                <p className="text-[13px] text-foreground-muted leading-relaxed">
                  Edit <span className="text-foreground font-medium">instructions.md</span> to set instructions the
                  agent will follow on every message.
                </p>
              </Section>

              {/* Skills */}
              <Section icon="fa-bolt" title="Skills">
                <p className="text-[13px] text-foreground-muted leading-relaxed">
                  Reusable prompts for common tasks. Enable them in the sidebar, then run with <Kbd>/name</Kbd> in chat.
                </p>
              </Section>

              {/* Connections */}
              <Section icon="fa-plug" title="Connections">
                <p className="text-[13px] text-foreground-muted leading-relaxed">
                  External tools (MCP) the agent can use. Configure in sidebar to add web search, APIs, and more.
                </p>
              </Section>
            </div>
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
})

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <i className={`fa-solid ${icon} text-foreground/40 text-xs w-4`}></i>
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      </div>
      <div className="ml-6">{children}</div>
    </div>
  )
}

function ShortcutRow({ keys, action }: { keys: string[]; action: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-foreground-muted">{action}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <Kbd key={i}>{key}</Kbd>
        ))}
      </div>
    </div>
  )
}

function CommandRow({ command, action }: { command: string; action: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-foreground-muted">{action}</span>
      <Kbd>{command}</Kbd>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="min-w-[24px] px-1.5 py-0.5 rounded bg-foreground/[0.07] text-foreground/70 font-mono text-[11px] text-center">
      {children}
    </kbd>
  )
}
