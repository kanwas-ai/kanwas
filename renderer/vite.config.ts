import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Electron's embedded runtime serves the production bundle under /app.
  const base = mode === 'development' ? '/' : '/app/'
  const runtimeTarget = process.env.KANWAS_RUNTIME_URL ?? 'http://127.0.0.1:4300'
  const runtimeOrigin = new URL(runtimeTarget).origin
  const runtimeProxy = (ws = false): ProxyOptions => ({
    target: runtimeOrigin,
    ws,
    changeOrigin: true,
    configure(proxy) {
      const rewriteOrigin = (proxyRequest: { setHeader(name: string, value: string): void }) => {
        proxyRequest.setHeader('Origin', runtimeOrigin)
      }
      proxy.on('proxyReq', rewriteOrigin)
      proxy.on('proxyReqWs', rewriteOrigin)
    },
  })

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': runtimeProxy(true),
        '/yjs/socket.io': runtimeProxy(true),
        '/mcp': runtimeProxy(),
      },
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
