import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2023', outDir: 'dist/page-runtime', emptyOutDir: false, sourcemap: false,
    lib: {
      entry: 'src/features/fingerprint-privacy/runtime/world-entry.ts',
      formats: ['iife'], name: 'BraveFingerprintRuntime', fileName: () => 'privacy-world.js',
    },
    minify: false,
  },
});
