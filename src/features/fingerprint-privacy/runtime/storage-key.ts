export type PrivacyStorageScope = {
  origin: string; topLevelSite: string | null; nonce: { high: string; low: string } | null;
};

export function parsePrivacyStorageKey(serialized: string): PrivacyStorageScope | null {
  if (!serialized || serialized.length > 32768) return null;
  const [rawOrigin, ...attributes] = serialized.split('^');
  let origin: string;
  try {
    const url = new URL(rawOrigin);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    origin = url.origin;
  } catch { return null; }
  let topLevelSite: string | null = null;
  let high: string | null = null;
  let low: string | null = null;
  for (const attribute of attributes) {
    const kind = attribute[0];
    const value = attribute.slice(1);
    if (kind === '0') {
      try { topLevelSite = new URL(value).origin; } catch { return null; }
    } else if (kind === '1' || kind === '2') {
      if (!/^\d+$/.test(value) || BigInt(value) > (1n << 64n) - 1n) return null;
      if (kind === '1') high = value; else low = value;
    } else if (kind === '3') {
      if (value !== '0' && value !== '1') return null;
    } else return null;
  }
  if ((high === null) !== (low === null)) return null;
  return { origin, topLevelSite, nonce: high !== null && low !== null ? { high, low } : null };
}
