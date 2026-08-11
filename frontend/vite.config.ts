import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Deploy under /app in non-dev environments; keep / for local dev.
  const base = mode === 'development' ? '/' : '/app/'

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      allowedHosts: true,
      host: '0.0.0.0',
      port: 5173,
      // `vite --mode kanwasup` = HMR dev against a running local daemon
      // (`kanwas up`). Proxying /local-login runs the daemon's login shim on
      // this origin, so it seeds localStorage here and redirects into /app/w/…,
      // which this dev server serves (base is /app/ outside development mode).
      proxy: mode === 'kanwasup' ? { '/local-login': 'http://127.0.0.1:4300' } : undefined,
    },
    build: {
      // Optimize chunking for better caching and faster loads
      rollupOptions: {
        output: {
          manualChunks: {
            // Separate heavy vendor libraries into their own chunks
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'reactflow': ['@xyflow/react'],
            'blocknote': ['@blocknote/core', '@blocknote/react', '@blocknote/mantine'],
            'query': ['@tanstack/react-query'],
          },
        },
      },
      // Increase chunk size warning limit for large libs
      chunkSizeWarningLimit: 1000,
    },
  }
})
