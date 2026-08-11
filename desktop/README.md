# desktop

A thin **Electron** shell over `kanwasd`, the local-first daemon in
`local-daemon`. No renderer-side app logic, no bundled frontend of its own —
the shell just makes sure a daemon is running and then points its window at
it.

## What it does on launch

1. **probes** `http://127.0.0.1:4300/auth/me` to see if a `kanwasd` is
   already running.
2. if none is running, **picks a folder**: the most recently opened vault
   from `~/.kanwas/vaults.json`, or a native folder picker on first run.
3. **spawns** `node <repo>/local-daemon/dist/cli.js up --no-open <folder>` —
   this builds the frontend web bundle on first use (~1 min, instant after)
   and boots the daemon on the fixed ports.
4. **navigates** the window to `http://127.0.0.1:4300/local-login`, which
   sets the auth token on its own origin and redirects into the canvas.

The daemon serves the stock Kanwas web frontend; the desktop shell doesn't
talk to it beyond that initial probe and navigation.

## Dev

```bash
pnpm --filter desktop dev
```

## Build

```bash
pnpm --filter desktop build
```

Output: `desktop/release/mac*/Kanwas.app` (exact path per electron-builder's
target arch — unsigned, dev-tethered to this checkout).

## Env overrides

- `KANWAS_PORT` — REST port the shell probes/spawns against (default `4300`)
- `KANWAS_REPO` — repo root override (where `local-daemon/dist/cli.js` is
  resolved from)
- `KANWAS_NODE` — path to the `node` binary used to spawn the daemon

## Prereqs

- Node ≥ 20 on the machine
- `pnpm --filter local-daemon build` has produced `local-daemon/dist`

## Quit behavior

Quitting the shell **leaves the daemon running** — it may still be serving
browser tabs. Run `kanwas down` (from `local-daemon`) to stop it.
