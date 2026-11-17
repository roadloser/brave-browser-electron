import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2023', outDir: 'dist/preload', emptyOutDir: false, sourcemap: true,
    lib: { entry: 'src/features/page-tools/page/preload.ts', formats: ['cjs'], fileName: () => 'translation.cjs' },
    rollupOptions: { external: ['electron'] },
  },
});
