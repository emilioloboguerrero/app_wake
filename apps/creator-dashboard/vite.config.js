import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
  base: '/creators/',
  server: {
    port: 3000,
    host: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001/wolf-20b8b/us-central1/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'build',
    chunkSizeWarningLimit: 5000,
    sourcemap: false,
    minify: 'esbuild',
    target: 'esnext',
    cssCodeSplit: false,
    reportCompressedSize: false,
    cssMinify: false,
    emptyOutDir: true,
  },
  publicDir: 'public',
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  esbuild: {
    target: 'esnext',
    logLevel: 'silent',
    treeShaking: true,
  },
})
