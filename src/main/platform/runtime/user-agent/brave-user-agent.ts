import { BrowserError } from '../../../../shared/errors';
import type { UserAgentBrand } from '../../../../shared/user-agent-port';
import type { NativeUserAgentSnapshot } from './native-user-agent';

type BrandVersion = { brand: string; version: string };
type UserAgentMetadata = {
  brands: BrandVersion[]; fullVersionList: BrandVersion[]; fullVersion: string;
  platform: string; platformVersion: string; architecture: string; model: string;
  mobile: boolean; bitness: string; wow64: boolean; formFactors: string[];
};
type UserAgentOverride = { userAgent: string; userAgentMetadata: UserAgentMetadata };
const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

export function braveUserAgent(snapshot: NativeUserAgentSnapshot, brand: UserAgentBrand): UserAgentOverride {
  const chromium = snapshot.brands.find(entry => entry.brand === 'Chromium');
  const fullChromium = snapshot.fullVersionList.find(entry => entry.brand === 'Chromium');
  if (chromium?.version !== '150' || !fullChromium?.version.startsWith('150.0.7871.') || !snapshot.uaFullVersion.startsWith('150.0.7871.')) {
    throw new BrowserError('UNAVAILABLE', '原生UA版本不属于已取证的Chromium150.0.7871，需更新映射依据');
  }
  const grease = snapshot.brands.find(entry => !['Chromium', 'Google Chrome', 'Electron', 'Brave'].includes(entry.brand));
  if (!grease || snapshot.brands.some(entry => entry.brand !== 'Chromium' && entry.brand !== grease.brand && !['Google Chrome', 'Electron', 'Brave'].includes(entry.brand))) {
    throw new BrowserError('UNAVAILABLE', '原生UA品牌列表与已取证结构不同，拒绝猜测GREASE');
  }
  const nativeUa = /^(Mozilla\/5\.0 \([^()\r\n]+\) AppleWebKit\/\d+(?:\.\d+)* \(KHTML, like Gecko\)) (?:[A-Za-z0-9._-]+\/[^\s]+ )*Chrome\/150(?:\.\d+)* (?:[A-Za-z0-9._-]+\/[^\s]+ )*(Safari\/\d+(?:\.\d+)*)$/.exec(snapshot.userAgent);
  if (!nativeUa) throw new BrowserError('UNAVAILABLE', '原生UA字符串结构未覆盖，拒绝仅修改部分产品标识');
  const major = Number(chromium.version);
  const base: BrandVersion[] = [grease, { brand: 'Chromium', version: chromium.version }, { brand, version: chromium.version }];
  const brands: BrandVersion[] = base.map(entry => ({ ...entry }));
  orders[major % orders.length].forEach((destination, index) => { brands[destination] = { ...base[index] }; });
  return {
    userAgent: `${nativeUa[1]} Chrome/${major}.0.0.0 ${nativeUa[2]}`,
    userAgentMetadata: {
      brands, fullVersionList: brands.map(entry => ({ brand: entry.brand, version: `${entry.version.split('.')[0]}.0.0.0` })),
      fullVersion: `${major}.0.0.0`, platform: snapshot.platform, platformVersion: snapshot.platformVersion,
      architecture: snapshot.architecture, model: '', mobile: snapshot.mobile,
      bitness: snapshot.bitness, wow64: snapshot.wow64, formFactors: [...snapshot.formFactors],
    },
  };
}
