# Kanwas renderer

The React/Vite user interface embedded in the Kanwas Electron app. It is not a
separately deployed website.

The production bundle is served by `@kanwas/local-runtime` under `/app`. REST,
terminal WebSockets, and the private Yjs document channel are same-origin;
Electron-only vault actions are exposed through the narrow `window.kanwas`
preload bridge. Yjs carries document updates only. Kanwas does not publish
presence or remote cursors.

For UI-only development, start the local runtime and run `pnpm dev`. Vite
proxies `/api`, `/yjs/socket.io`, and `/mcp` to `127.0.0.1:4300`.
