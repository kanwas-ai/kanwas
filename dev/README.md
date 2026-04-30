# Developer Tools

This directory contains development scripts and examples.

## Scripts

- `dev-iterm.sh` / `dev-iterm.scpt` - Start all development services in iTerm tabs
- `dev-kill.sh` - Kill all development services
- `DEV-SCRIPTS.md` - Documentation for the dev scripts

## Claude Code Commands

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

Note: `.claude/` is gitignored, so local commands won't be committed.
