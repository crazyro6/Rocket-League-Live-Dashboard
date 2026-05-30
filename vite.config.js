import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    proxy: {
      // Dev only: forward /rl and /tracker to the Node proxy. In production the
      // proxy serves the built app on the same origin, so no rewrite is needed.
      '/rl': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/tracker': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  },
})
