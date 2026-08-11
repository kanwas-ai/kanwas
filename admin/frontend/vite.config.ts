import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Production builds use a placeholder base (rewritten at serve time by the
// admin backend) so a single artifact works under any ADMIN_PATH. Dev keeps a
// stable /admin-dev/ base so the local Vite server URL doesn't change.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'serve' ? '/admin-dev/' : '/__ADMIN_BASE__/',
  build: {
    outDir: resolve(__dirname, '../../backend/resources/admin'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
  },
}))
