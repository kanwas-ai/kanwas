---
name: kanwas-cli
description: Sync local files with a Kanwas workspace using the kanwas CLI. Use when the user wants to pull workspace content into the repo, push local edits back, or bulk-import markdown files from disk. Workspaces are trees of markdown notes organized into canvases (directories).
---

# Kanwas CLI

> **Install as a Claude Code skill:** copy this file to `~/.claude/skills/kanwas-cli/SKILL.md` (user-wide) or `.claude/skills/kanwas-cli/SKILL.md` (per-project).

`kanwas` is a CLI for syncing a Kanwas workspace with the local filesystem. Workspaces live as trees of canvases (directories) and nodes (files); markdown notes are `.md` files inside canvas directories.

## When to use

- The user references "my Kanwas workspace" and wants its content available as files in the repo.
- The user has a spec/PRD/notes in Kanwas and wants you to read it before implementing.
- The user has local markdown notes they want bulk-imported into a workspace.
- The user wants you to write notes/output back to Kanwas.

## When NOT to use

- The user is asking how Kanwas works conceptually — answer directly, don't shell out.
- The task is fully local with no Kanwas content involved.

## Setup checks

Before any sync command:

```bash
which kanwas || echo "not installed"
test -f ~/.kanwas/config.json || echo "not authenticated"
```

If not installed: `npm install -g @kanwas/cli` (Node 22+).

If not authenticated: ask the user to run `kanwas login` themselves — it's an interactive browser flow that you can't complete from a non-interactive shell.

## Pick a workspace non-interactively

The interactive picker hangs in non-interactive shells. Always use `--id` or `--name`:

```bash
kanwas workspaces --json    # discover IDs and names
kanwas pull --id <uuid>     # pin by UUID (preferred — names can repeat)
kanwas pull --name "<name>" # pin by exact name
```

If multiple workspaces share the same name, `--name` exits with an error listing the IDs — fall back to `--id`.

## Common flows

### Pull a workspace to read its content

```bash
mkdir kanwas-workspace && cd kanwas-workspace
kanwas pull --id <uuid>
```

Files appear under the current directory. A `.kanwas.json` is written that binds the directory to the workspace; subsequent `pull` / `push` reuse it.

### Push local edits back

```bash
cd <directory bound by an earlier pull>
kanwas push
```

`push` is a three-way diff against the snapshot from the last `pull`. Conflicts (file changed both locally and remotely) trigger an interactive prompt — avoid running `push` non-interactively when conflicts are likely; pull first, resolve, then push.

### Import markdown from disk into a workspace

```bash
kanwas import ./notes --id <uuid>                # all .md under ./notes
kanwas import ./intro.md --id <uuid>             # single file
kanwas import ./notes --id <uuid> --dest research # place under a subfolder
kanwas import ./notes --id <uuid> --overwrite    # replace existing files
```

Only `.md` files are imported; other file types are silently skipped and counted in the summary. Existing files are skipped unless `--overwrite` is set.

`import` is a one-shot — it does not create `.kanwas.json` and does not track imported files for later sync. To start tracking after an import, run `kanwas pull --id <uuid>` in a fresh directory.

### Hand workspace content to another coding agent

```bash
mkdir spec && cd spec
kanwas pull --id <uuid>
# Now ./spec contains the workspace as files. Hand the path to Claude Code, Codex, etc.
```

## Pitfalls

- **Don't run `kanwas login` from an automated context.** It opens a browser and waits for callback. Surface the instruction to the user instead.
- **Don't `kanwas clean` without explicit user confirmation.** It deletes all remote files in the bound workspace.
- **Don't pull into a non-empty directory without checking.** `pull` warns interactively if the cwd is non-empty on first use; in non-interactive shells, prefer a fresh directory.
- **Don't assume `--name` resolves uniquely.** Workspace names can collide. Prefer `--id` when scripting.
- **`import` does not bind the directory.** If the user expects to keep editing the imported files locally and syncing back, they need a separate `pull` afterward.
- **Filenames must be `lower-kebab-case`.** Imports preserve filenames as-is — warn the user before importing files like `My Notes.md` (will land as a different shape than the workspace's other content).

## Quick reference

| Command                | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `kanwas login`         | Browser-based auth (interactive only)                                  |
| `kanwas workspaces`    | List workspaces; add `--json` for parsing                              |
| `kanwas pull`          | Download workspace files; binds the directory via `.kanwas.json`       |
| `kanwas push`          | Upload local edits; three-way diff with conflict prompts               |
| `kanwas import <path>` | One-shot import of `.md` files from a file/folder                      |
| `kanwas clean`         | Delete all remote files in the bound workspace (destructive; ask user) |

Full option list: `kanwas <command> --help`.
