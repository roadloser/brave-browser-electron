import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2023', outDir: 'dist/preload', emptyOutDir: false, sourcemap: true,
    lib: { entry: 'src/features/fingerprint-privacy/runtime/service-worker-preload.ts', formats: ['cjs'], fileName: () => 'privacy-service-worker.cjs' },
    rollupOptions: { external: ['electron'] },
  },
});
