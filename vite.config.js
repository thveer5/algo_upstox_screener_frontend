import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server proxies /api and /auth to the FastAPI backend on :8000
// so the React app can call them as same-origin (no CORS dance).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
      '/me': 'http://localhost:8000',
    },
  },
})
