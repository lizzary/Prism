import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The source fonts live next to the app (the served copies are in public/fonts); keep Vite's watcher out of them.
const IGNORED = ['**/font/**', '**/.idea/**'];

export default defineConfig({
  plugins: [react()],
  base: './',
  optimizeDeps: { entries: ['index.html'] },
  server: { port: 5191, watch: { ignored: IGNORED } },
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
});
