import { randomBytes } from 'node:crypto';
import type { BrowserContext } from '../../../shared/contracts/browser-core';
import type { StorageHost } from '../../../shared/runtime-ports';
import { PrivacyRepository } from './privacy-repository';

export type FarblingToken = { high: string; low: string; generation: number };
export interface FarblingTokenProviderPort {
  forSite(context: BrowserContext, site: string): FarblingToken;
  release(contextId: string): void;
  dispose(): void;
}

export class BraveTokenProvider implements FarblingTokenProviderPort {
  private readonly sessionEntropy = new Map<string, Buffer>();
  private readonly privateTokens = new Map<string, Map<string, Buffer>>();
  private readonly generation = Date.now();
  constructor(private readonly storage: StorageHost) {}

  forSite(context: BrowserContext, site: string): FarblingToken {
    const identity = context.isPrivate ? `private:${context.contextId}` : `profile:${context.profileId}`;
    let entropy = this.sessionEntropy.get(identity);
    if (!entropy) { entropy = randomBytes(16); this.sessionEntropy.set(identity, entropy); }
    let token: Buffer;
    if (context.isPrivate) {
      const tokens = this.privateTokens.get(context.contextId) ?? new Map<string, Buffer>();
      token = tokens.get(site) ?? randomBytes(16);
      tokens.set(site, token); this.privateTokens.set(context.contextId, tokens);
    } else {
      const repository = new PrivacyRepository(this.storage.open(context.profileId));
      const saved = repository.token(site);
      if (saved && /^[a-f0-9]{32}$/.test(saved) && !/^0+$/.test(saved)) token = Buffer.from(saved, 'hex');
      else { token = randomBytes(16); repository.saveToken(site, token.toString('hex')); }
    }
    return {
      high: (token.readBigUInt64BE(0) ^ entropy.readBigUInt64BE(0)).toString(),
      low: (token.readBigUInt64BE(8) ^ entropy.readBigUInt64BE(8)).toString(),
      generation: this.generation,
    };
  }

  release(contextId: string): void {
    this.sessionEntropy.delete(`private:${contextId}`);
    this.privateTokens.delete(contextId);
  }
  dispose(): void {
    for (const value of this.sessionEntropy.values()) value.fill(0);
    for (const tokens of this.privateTokens.values()) for (const value of tokens.values()) value.fill(0);
    this.sessionEntropy.clear(); this.privateTokens.clear();
  }
}
