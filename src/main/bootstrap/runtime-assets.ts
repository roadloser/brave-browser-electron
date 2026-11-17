import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FeatureRuntime } from '../../shared/module-lifecycle';
import { BrowserError } from '../../shared/errors';

export function loadRuntimeAssets(appPath: string): FeatureRuntime['assets'] {
  const privacyWorldSource = readFileSync(join(appPath, 'dist/page-runtime/privacy-world.js'), 'utf8');
  if (!privacyWorldSource || privacyWorldSource.length > 4_000_000) {
    throw new BrowserError('UNAVAILABLE', '指纹页面运行时资源缺失或超出限制', false);
  }
  return {
    credentialPreloadPath: join(appPath, 'dist/preload/credentials.cjs'),
    translationPreloadPath: join(appPath, 'dist/preload/translation.cjs'),
    shieldsPreloadPath: join(appPath, 'dist/preload/shields.cjs'),
    walletPreloadPath: join(appPath, 'dist/preload/wallet.cjs'),
    privacyWorldSource,
  };
}
