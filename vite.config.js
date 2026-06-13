import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// SPA живёт на корне putevo.su (публичная витрина для гостя + рабочее
// пространство для сотрудника). Старый префикс /admin остаётся редиректом в Caddy.
export default defineConfig(() => ({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
