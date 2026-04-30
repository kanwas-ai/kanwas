import { defineConfig } from 'tsup'
import { builtinModules } from 'module'

const builtinSet = new Set(builtinModules)

function isNodeBuiltin(id: string): boolean {
  if (id.startsWith('node:')) return true
  const base = id.split('/')[0]
  return builtinSet.has(base)
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  // Only bundle `shared` — everything else stays external (installed from npm)
  noExternal: ['shared'],
  esbuildPlugins: [
    {
      name: 'externalize-node-builtins',
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (isNodeBuiltin(args.path)) {
            return { path: args.path, external: true }
          }
          return undefined
        })
      },
    },
  ],
  onSuccess: `node -e "const f='dist/index.js';const c=require('fs').readFileSync(f,'utf8');require('fs').writeFileSync(f,'#!/usr/bin/env node\\n'+c)"`,
})
