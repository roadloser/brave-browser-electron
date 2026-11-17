import type { RewardsState } from '../../../shared/contracts/rewards';
import type { Migration, ProfileDatabase } from '../../../shared/runtime-ports';

export type RewardsStored = RewardsState & {
  serviceKeyCipher: string | null; seedCipher: string | null; providerId?: string | null;
  availableSelfCustody?: Record<string, boolean>;
};
export const rewardsMigrations: readonly Migration[] = [{
  id: 'rewards.initial', version: 1,
  up(database) { database.exec('CREATE TABLE rewards_state(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL)'); },
}];

export function emptyRewards(): RewardsStored {
  return {
    status: 'unconfigured', endpoint: '', hasServiceKey: false, country: null, paymentId: null,
    balance: { amount: null, currency: 'BAT', status: 'unknown', updatedAt: null },
    provider: null, linked: null, selfCustodyAvailable: null,
    account: { status: 'unconnected' },
    ads: { status: 'unknown', reason: '广告资格、目录及确认协议尚未完成接入' },
    settlement: { status: 'unknown' },
    capabilities: [
      { operation: '钱包注册', status: 'implemented', reason: '按Brave v4端点与签名；官方接受条件未运行确认' },
      { operation: '账户状态查询', status: 'implemented', reason: 'GET v4钱包状态；不将账户状态当作余额' },
      { operation: 'Solana自托管连接', status: 'implemented', reason: '官方challenge/签名/cookie/页面/服务轮询；须服务返回solana资格' },
      { operation: '其他外部账户连接', status: 'blocked', reason: '对应provider OAuth资格、回调与连接协议仍未接入' },
      { operation: '广告盲签token', status: 'implemented', reason: '同源WASM随机/盲化/证明/去盲；独立issuer信任与服务接受仍需确认' },
      { operation: '广告资格与展示确认', status: 'blocked', reason: '需Brave Ads目录、资格与匿名确认token协议，未用页面广告替代' },
      { operation: 'Solana BAT余额', status: 'implemented', reason: '仅服务确认连接地址后通过已配置RPC取得实际token余额' },
      { operation: '其他余额和结算', status: 'blocked', reason: '对应wallet provider与广告payment token结算尚未接入' },
    ],
    lastRequestId: null, revision: 0, serviceKeyCipher: null, seedCipher: null,
  };
}

export class RewardsRepository {
  constructor(private readonly database: ProfileDatabase) {}
  get(): RewardsStored {
    const row = this.database.get<{ record: string }>('SELECT record FROM rewards_state WHERE id=1');
    return row ? JSON.parse(row.record) as RewardsStored : emptyRewards();
  }
  save(record: RewardsStored): RewardsStored {
    const value = { ...record, revision: this.get().revision + 1 };
    this.database.transaction(() => this.database.run('INSERT INTO rewards_state(id,record) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record', [JSON.stringify(value)]));
    return value;
  }
}
