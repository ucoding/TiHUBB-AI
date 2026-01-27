// web/vite.config.js

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // --- 新增代理配置 ---
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // 👈 确保这里是你 server/index.js 运行的端口
        changeOrigin: true,
        // 如果你的后端接口定义的路由是 app.post('/api/run', ...) 就不需要 rewrite
        // 如果后端路由是 app.post('/run', ...) 且没有 /api 前缀，则取消下面一行的注释
        // rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})