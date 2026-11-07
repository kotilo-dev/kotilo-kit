import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri expects a fixed dev port and a static build in ../dist (see src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // kit-themes imports ../../docs/05-themes.toml from the repo root
    fs: { allow: [resolve(__dirname, '../..')] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        palette: resolve(__dirname, 'index.html'),
        main: resolve(__dirname, 'main.html'),
        toast: resolve(__dirname, 'toast.html'),
      },
    },
  },
});
