import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

export default defineConfig({
  build: {
    target: 'node24', outDir: 'dist/main', emptyOutDir: true, sourcemap: true,
    lib: { entry: 'src/main/index.ts', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: {
      external: ['electron', 'better-sqlite3', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
    },
  },
});
