import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const manifest = require('./package.json') as { dependencies: Record<string, string> };
const dependencies = Object.keys(manifest.dependencies);
const builtins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);

export default defineConfig({
  build: {
    target: 'node24', outDir: 'dist/main', emptyOutDir: true, sourcemap: true,
    lib: { entry: 'src/main/index.ts', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: {
      external: id => !id.includes('?raw') && (
        id === 'electron' || builtins.has(id) || dependencies.some(name => id === name || id.startsWith(name + '/'))
      ),
    },
  },
});
