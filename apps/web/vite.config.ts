import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const nid = id.replace(/\\/g, '/');
          if (nid.includes('node_modules/react') || nid.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (nid.includes('node_modules/katex')) {
            return 'vendor-katex';
          }
          if (nid.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (nid.includes('node_modules/echarts') || nid.includes('node_modules/echarts-for-react') || nid.includes('node_modules/zrender')) {
            return 'vendor-echarts';
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})
