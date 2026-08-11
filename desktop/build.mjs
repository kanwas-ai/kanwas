// Replaces the old `esbuild ...` CLI invocation in package.json's `bundle`
// script. Needs to be a script (not a CLI one-liner) so it can compute the
// dev repo root from its own file location and bake it into the bundle via
// `define` — see the doc comment on `resolveRepoRoot` in `src/main.ts`.

import { build } from 'esbuild'
import { fileURLToPath } from 'url'
import * as path from 'path'

const desktopDir = path.dirname(fileURLToPath(import.meta.url))
const devRepoRoot = path.resolve(desktopDir, '..')

await build({
  entryPoints: ['src/main.ts', 'src/preload.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outdir: 'dist',
  define: {
    __KANWAS_DEV_REPO__: JSON.stringify(devRepoRoot),
  },
})
