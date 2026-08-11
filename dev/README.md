# Developer tools

Kanwas runs as one Electron application, so the old multi-service development
launchers are no longer needed. Start the app from the repository root with:

```bash
pnpm --filter @kanwas/desktop dev
```

## Claude Code commands

The `claude-commands/` directory contains example slash commands for Claude Code.

To use these commands globally (across all projects), copy them to your home directory:

```bash
mkdir -p ~/.claude/commands
cp dev/claude-commands/*.md ~/.claude/commands/
```

Or to use them only in this project, copy to `.claude/commands/`:

```bash
mkdir -p .claude/commands
cp dev/claude-commands/*.md .claude/commands/
```

`.claude/` is gitignored, so local commands are not committed.
