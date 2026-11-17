import { ApiPromise, HttpProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import type { WalletAccount, WalletNetwork } from '../../../../shared/contracts/wallet';
import type { ChainAdapterPort, KeyMaterial, PreparedTransfer, SignedTransfer, TransferIntent } from './adapter';
import { amountToBase, formatAmount } from './network-client';

export class PolkadotAdapter implements ChainAdapterPort {
  readonly chain = 'polkadot' as const;
  readonly version = 'polkadot-api-17.0.2/sr25519';
  readonly capability = { chain: this.chain, account: true, transfer: true, messageSign: true, dapp: false, shielded: false };
  private async pair(key: KeyMaterial, network: WalletNetwork) {
    await cryptoWaitReady();
    return new Keyring({ type: 'sr25519', ss58Format: network.testnet ? 42 : 0 })
      .addFromUri(`${key.mnemonic}${key.index ? '//'+String(key.index - 1) : ''}`);
  }
  private api(network: WalletNetwork) { return ApiPromise.create({ provider: new HttpProvider(network.rpcUrl), noInitWarn: true }); }
  async derive(key: KeyMaterial, network: WalletNetwork) {
    const pair = await this.pair(key, network);
    try { return pair.address; } finally { pair.lock(); }
  }
  async balance(account: WalletAccount, network: WalletNetwork) {
    const api = await this.api(network);
    try {
      const result = await api.query.system.account(account.address);
      const data = result.toJSON() as { data: { free: string | number } };
      return BigInt(data.data.free).toString();
    } finally { await api.disconnect(); }
  }
  async prepare(_key: KeyMaterial, account: WalletAccount, network: WalletNetwork, intent: TransferIntent): Promise<PreparedTransfer> {
    const api = await this.api(network);
    try {
      const extrinsic = api.tx.balances.transferKeepAlive(intent.to, amountToBase(intent.value, network.decimals).toString());
      const nonce = await api.rpc.system.accountNextIndex(account.address);
      const fee = await extrinsic.paymentInfo(account.address, { nonce });
      return { to: intent.to, value: intent.value, fee: formatAmount(fee.partialFee.toString(), network.decimals), expiresAt: Date.now() + 60000,
        payload: { call: extrinsic.method.toHex(), nonce: nonce.toString(), specVersion: api.runtimeVersion.specVersion.toString() },
        details: { recipient: intent.to, value: `${intent.value} ${network.symbol}`, networkFee: `${formatAmount(fee.partialFee.toString(), network.decimals)} ${network.symbol}`, nonce: nonce.toString(), network: network.name } };
    } finally { await api.disconnect(); }
  }
  async sign(key: KeyMaterial, network: WalletNetwork, prepared: PreparedTransfer) {
    const api = await this.api(network);
    const pair = await this.pair(key, network);
    try {
      const payload = prepared.payload as { call: string; nonce: string; specVersion: string };
      if (api.runtimeVersion.specVersion.toString() !== payload.specVersion) throw new Error('网络运行时已升级，请重新确认交易');
      const extrinsic = api.tx(payload.call);
      await extrinsic.signAsync(pair, { nonce: payload.nonce, era: 0 });
      return { payload: extrinsic.toHex(), hash: extrinsic.hash.toHex() };
    } finally { pair.lock(); await api.disconnect(); }
  }
  async signMessage(key: KeyMaterial, network: WalletNetwork, message: string) {
    const pair = await this.pair(key, network);
    try { return `0x${Buffer.from(pair.sign(Buffer.from(message, 'utf8'))).toString('hex')}`; }
    finally { pair.lock(); }
  }
  async broadcast(network: WalletNetwork, signed: SignedTransfer) {
    const api = await this.api(network);
    try { return (await api.rpc.author.submitExtrinsic(signed.payload)).toHex(); }
    finally { await api.disconnect(); }
  }
  async status(network: WalletNetwork, hash: string) {
    const api = await this.api(network);
    try {
      const pending = await api.rpc.author.pendingExtrinsics();
      if (pending.some((extrinsic) => extrinsic.hash.toHex() === hash)) return 'pending' as const;
      const head = await api.rpc.chain.getFinalizedHead();
      const header = await api.rpc.chain.getHeader(head);
      const height = header.number.toNumber();
      for (let offset = 0; offset < 64 && height >= offset; offset++) {
        const blockHash = offset === 0 ? head : await api.rpc.chain.getBlockHash(height - offset);
        const block = await api.rpc.chain.getBlock(blockHash);
        const index = block.block.extrinsics.findIndex((extrinsic) => extrinsic.hash.toHex() === hash);
        if (index < 0) continue;
        const historical = await api.at(blockHash);
        const events = await historical.query.system.events();
        const scoped = [...events].filter((entry) => entry.phase.isApplyExtrinsic && entry.phase.asApplyExtrinsic.toNumber() === index);
        if (scoped.some((entry) => entry.event.section === 'system' && entry.event.method === 'ExtrinsicFailed')) return 'failed' as const;
        return scoped.some((entry) => entry.event.section === 'system' && entry.event.method === 'ExtrinsicSuccess') ? 'confirmed' as const : 'unknown' as const;
      }
      return 'unknown' as const;
    } finally { await api.disconnect(); }
  }
  dispose() {}
}
