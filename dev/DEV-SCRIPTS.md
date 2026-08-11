# Development Scripts

Quick scripts to start and stop the entire dev environment in iTerm2.

## Start Development

```bash
./dev-iterm.sh
```

Opens a new iTerm2 window with 4 split panes:

```
Left side:                Right side:
- docker-compose          - frontend
- yjs-server              - backend
```

**Features:**

- Auto-restart: If any dev server crashes, it automatically restarts after 2 seconds
- You'll see a message like `🔄 Backend crashed, restarting in 2s...`

## Stop Everything

```bash
./dev-kill.sh
```

Kills all dev processes and runs `docker-compose down`. Use this when:

- You closed terminal windows without stopping processes
- You see "port already in use" errors
- You want a clean restart

## Workflow

```bash
# Start fresh
./dev-kill.sh && ./dev-iterm.sh

# Just stop
./dev-kill.sh
```
