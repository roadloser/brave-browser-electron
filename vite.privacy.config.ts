import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2023', outDir: 'dist/preload', emptyOutDir: false, sourcemap: true,
    lib: { entry: 'src/features/fingerprint-privacy/runtime/frame-preload.ts', formats: ['cjs'], fileName: () => 'privacy.cjs' },
    rollupOptions: { external: ['electron'] },
  },
});
