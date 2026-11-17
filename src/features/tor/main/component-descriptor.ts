import { createReadStream } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { BrowserError } from '../../../shared/errors';

const descriptorSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:\.\d+)?(?:-[a-z0-9.]+)?$/i),
  platform: z.literal('darwin'), arch: z.enum(['arm64', 'x64']),
  executable: z.string().min(1), sourceUrl: z.string().url(), verificationUrl: z.string().url(),
  files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/i)),
  geoIpFile: z.string().optional(), geoIpv6File: z.string().optional(),
});
export type TorComponent = z.infer<typeof descriptorSchema> & { directory: string; manifestHash: string; confirmedAt: number };
export async function readTorComponent(directory: string): Promise<TorComponent> {
  const root = await realpath(directory);
  const bytes = await readFile(join(root, 'tor-component.json'));
  if (bytes.length > 65536) throw new BrowserError('INVALID_ARGUMENT', 'Tor 组件清单过大');
  const descriptor = descriptorSchema.parse(JSON.parse(bytes.toString('utf8')));
  if (descriptor.platform !== process.platform || descriptor.arch !== process.arch) throw new BrowserError('UNAVAILABLE', 'Tor 组件与当前系统架构不一致');
  for (const urlValue of [descriptor.sourceUrl, descriptor.verificationUrl]) {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' || !(url.hostname === 'torproject.org' || url.hostname.endsWith('.torproject.org'))) throw new BrowserError('FORBIDDEN', '组件来源及验证依据必须指向 Tor Project 官方 HTTPS 地址');
  }
  if (!descriptor.files[descriptor.executable]) throw new BrowserError('INVALID_ARGUMENT', '组件清单没有包含可执行文件校验值');
  if (Object.keys(descriptor.files).length > 256) throw new BrowserError('INVALID_ARGUMENT', 'Tor 组件清单文件数量超过限制');
  for (const [file, expected] of Object.entries(descriptor.files)) {
    const path = await componentFile(root, file);
    if (!(await stat(path)).isFile()) throw new BrowserError('INVALID_ARGUMENT', '组件清单只能登记普通文件');
    if (await fileHash(path) !== expected.toLowerCase()) throw new BrowserError('CONFLICT', 'Tor 组件完整性不匹配：' + file);
  }
  for (const path of [descriptor.geoIpFile, descriptor.geoIpv6File]) if (path && !descriptor.files[path]) throw new BrowserError('INVALID_ARGUMENT', 'GeoIP 文件必须包含在完整性清单中');
  await access(await componentFile(root, descriptor.executable), constants.X_OK);
  return { ...descriptor, directory: root, manifestHash: createHash('sha256').update(bytes).digest('hex'), confirmedAt: Date.now() };
}
export async function componentFile(root: string, file: string): Promise<string> {
  if (isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw new BrowserError('INVALID_ARGUMENT', '组件清单不能引用目录外文件');
  const path = await realpath(join(root, file));
  const relativePath = relative(root, path);
  if (relativePath === '..' || relativePath.startsWith('..' + sep) || isAbsolute(relativePath)) throw new BrowserError('FORBIDDEN', '组件文件指向选择目录以外');
  return path;
}
async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
