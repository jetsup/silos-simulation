import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false,
    proxy: { '/api': 'http://localhost:3001' }
  },
  build: { outDir: 'dist', sourcemap: false }
});
