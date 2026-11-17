import { build } from 'vite';

for (const configFile of [
  'vite.main.config.ts',
  'vite.preload.config.ts',
  'vite.credentials.config.ts',
  'vite.translation.config.ts',
  'vite.shields.config.ts',
  'vite.privacy-world.config.ts',
  'vite.wallet.config.ts',
  'vite.config.ts',
]) {
  await build({ configFile });
}
