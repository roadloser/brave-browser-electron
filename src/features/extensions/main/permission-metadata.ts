import type { ExtensionManifest } from './manifest';

export function retainDeclaredGrants(grants: readonly string[], manifest: ExtensionManifest): string[] {
  const declared = new Set([
    ...(manifest.permissions ?? []), ...(manifest.host_permissions ?? []),
    ...(manifest.optional_permissions ?? []), ...(manifest.optional_host_permissions ?? []),
  ]);
  return grants.filter(grant => declared.has(grant));
}
