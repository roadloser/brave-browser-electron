import { spawn } from 'node:child_process';
import { createServer, build } from 'vite';
import electron from 'electron';

const children = new Set();
const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
await build({ configFile: 'vite.preload.config.ts' });
await build({ configFile: 'vite.credentials.config.ts' });
await build({ configFile: 'vite.translation.config.ts' });
await build({ configFile: 'vite.shields.config.ts' });
await build({ configFile: 'vite.privacy-world.config.ts' });
await build({ configFile: 'vite.wallet.config.ts' });
await build({ configFile: 'vite.main.config.ts' });
const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, BRAVE_ELECTRON_UI_URL: 'http://127.0.0.1:5173' },
});
children.add(child);
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const processHandle of children) processHandle.kill();
  await server.close();
  process.exitCode = code;
}
child.once('exit', code => void stop(code ?? 0));
process.once('SIGINT', () => void stop(0));
process.once('SIGTERM', () => void stop(0));
