import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { inlineScriptPolicy } from './config/inline-script-policy';

export default defineConfig({
  base: './',
  plugins: [react(), inlineScriptPolicy()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'es2023', outDir: 'dist/renderer', emptyOutDir: true, sourcemap: true },
});
