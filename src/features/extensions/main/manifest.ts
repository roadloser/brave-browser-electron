import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { BrowserError } from '../../../shared/errors';

export const manifestSchema = z.object({
  manifest_version: z.union([z.literal(2), z.literal(3)]),
  name: z.string().min(1).max(2048),
  version: z.string().regex(/^\d+(?:\.\d+){0,3}$/),
  description: z.string().max(8192).optional(),
  key: z.string().optional(),
  default_locale: z.string().max(80).optional(),
  permissions: z.array(z.string()).optional(),
  host_permissions: z.array(z.string()).optional(),
  optional_permissions: z.array(z.string()).optional(),
  optional_host_permissions: z.array(z.string()).optional(),
  action: z.object({ default_title: z.string().optional(), default_popup: z.string().optional() }).passthrough().optional(),
  browser_action: z.object({ default_title: z.string().optional(), default_popup: z.string().optional() }).passthrough().optional(),
}).passthrough();

export type ExtensionManifest = z.infer<typeof manifestSchema>;

export async function readManifest(directory: string): Promise<ExtensionManifest> {
  const result = manifestSchema.safeParse(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')));
  if (!result.success) throw new BrowserError('INVALID_ARGUMENT', '扩展 manifest 无效或版本不受支持');
  const manifest = result.data;
  if (manifest.default_locale && /^__MSG_.+__$/.test(manifest.name)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(manifest.default_locale)) throw new BrowserError('INVALID_ARGUMENT', '扩展语言目录无效');
    try {
      const messages: Record<string, { message?: unknown }> = JSON.parse(await readFile(join(directory, '_locales', manifest.default_locale, 'messages.json'), 'utf8'));
      const key = manifest.name.slice(6, -2);
      const message = messages[key]?.message;
      if (typeof message === 'string') manifest.name = message;
    } catch {}
  }
  return manifest;
}

export function manifestPermissions(manifest: ExtensionManifest) {
  const permissions = (manifest.permissions ?? []).filter(permission => !permission.includes('://') && permission !== '<all_urls>');
  const hostPermissions = [...new Set([...(manifest.host_permissions ?? []), ...(manifest.permissions ?? []).filter(permission => permission.includes('://') || permission === '<all_urls>')])];
  return { permissions, hostPermissions };
}

export function manifestExtensionId(manifest: ExtensionManifest): string | undefined {
  if (!manifest.key) return undefined;
  const hexadecimal = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
  return hexadecimal.replace(/[0-9a-f]/g, character => String.fromCharCode(97 + Number.parseInt(character, 16)));
}

export async function fingerprintDirectory(directory: string): Promise<string> {
  const digest = createHash('sha256');
  let count = 0;
  let bytes = 0;
  async function visit(relative: string): Promise<void> {
    const path = join(directory, relative);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new BrowserError('INVALID_ARGUMENT', '扩展目录包含符号链接，请使用独立完整目录');
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(join(relative, name));
      return;
    }
    if (!info.isFile()) throw new BrowserError('INVALID_ARGUMENT', '扩展目录包含不支持的文件');
    count++;
    bytes += info.size;
    if (count > 20_000 || bytes > 256 * 1024 * 1024) throw new BrowserError('INVALID_ARGUMENT', '扩展超过单次安装的文件或大小限制');
    digest.update(relative).update('\0').update(await readFile(path));
  }
  await visit('');
  return digest.digest('hex');
}
