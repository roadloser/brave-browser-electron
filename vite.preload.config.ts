import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2023', outDir: 'dist/preload', emptyOutDir: true, sourcemap: true,
    lib: { entry: 'src/preload/index.ts', formats: ['cjs'], fileName: () => 'index.cjs' },
    rollupOptions: { external: ['electron'] },
  },
});
