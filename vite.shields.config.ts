import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2023', outDir: 'dist/preload', emptyOutDir: false, sourcemap: true,
    lib: { entry: 'src/features/shields/page/cosmetic-agent.ts', formats: ['cjs'], fileName: () => 'shields.cjs' },
    rollupOptions: { external: ['electron'] },
  },
});
