import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  base: '/pictura/',
  build: { 
    outDir: 'docs',
    emptyOutDir: true
  },
  server: {
    proxy: {
      '/collect': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    }
  }
})
