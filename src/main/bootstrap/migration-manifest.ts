import type { Migration } from '../../shared/runtime-ports';
import { featureManifest } from './feature-manifest';

export const migrationManifest: readonly Migration[] = featureManifest.flatMap(feature => feature.migrations);
