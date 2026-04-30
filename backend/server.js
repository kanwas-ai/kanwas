/*
|--------------------------------------------------------------------------
| JavaScript entrypoint for running the HTTP server in production
|--------------------------------------------------------------------------
|
| Backend is shipped as TypeScript source and runs through the
| `ts-node-maintained` ESM hook (same as `ace.js`). This avoids needing a
| pre-compiled build directory, and keeps workspace deps that export `.ts`
| paths loadable at runtime.
|
*/

import 'ts-node-maintained/register/esm'

await import('./bin/server.ts')
