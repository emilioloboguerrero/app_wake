import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    open: false,
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
