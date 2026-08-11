// Bundle the Electron main and preload entrypoints while keeping native and
// asset-relative dependencies external so they resolve from node_modules.

import { build } from 'esbuild'
await build({
  entryPoints: ['src/main.ts', 'src/preload.ts'],
  bundle: true,
  platform: 'node',
  // jsdom locates its synchronous-XHR worker relative to its installed package.
  // Keep it external so that asset and its internal relative imports remain
  // intact instead of being flattened into main.js by esbuild.
  external: ['electron', 'node-pty', 'jsdom'],
  outdir: 'dist',
  sourcemap: true,
})
