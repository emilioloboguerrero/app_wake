import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3001,
    host: 'localhost',
    proxy: {
      '/api': {
        target: `http://127.0.0.1:5001/${process.env.VITE_FIREBASE_PROJECT || 'wolf-20b8b'}/us-central1/api`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
