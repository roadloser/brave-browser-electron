import type { WalletAccount, WalletNetwork } from '../../../../shared/contracts/wallet';
import { BrowserError } from '../../../../shared/errors';
import type { ChainAdapterPort, KeyMaterial, PreparedTransfer, SignedTransfer, TransferIntent } from './adapter';
import { amountToBase, formatAmount, rpc } from './network-client';
import { filecoinWasm, type FilecoinMessage } from './filecoin-wasm';

export class FilecoinAdapter implements ChainAdapterPort {
  readonly chain = 'filecoin' as const;
  readonly version = 'zondax-2.4.3/node-wasm';
  readonly capability = { chain: this.chain, account: true, transfer: true, messageSign: false, dapp: false, shielded: false,
    reason: '软件 secp256k1 账户；导入 BLS 账户与硬件签名需单独适配' };
  private key(key: KeyMaterial, network: WalletNetwork) {
    return filecoinWasm().keyDerive(key.mnemonic, `m/44'/${network.testnet ? 1 : 461}'/0'/0/${key.index}`, '', 'en');
  }
  async derive(key: KeyMaterial, network: WalletNetwork) {
    const extended = this.key(key, network);
    try {
      const recovered = filecoinWasm().keyRecover(extended.private_raw, network.testnet);
      try { return recovered.address; } finally { recovered.free(); }
    } finally { extended.free(); }
  }
  async balance(account: WalletAccount, network: WalletNetwork) { return rpc<string>(network.rpcUrl, 'Filecoin.WalletBalance', [account.address]); }
  async prepare(_key: KeyMaterial, account: WalletAccount, network: WalletNetwork, intent: TransferIntent): Promise<PreparedTransfer> {
    if (!/^[ft][0-4][a-zA-Z0-9]+$/.test(intent.to) || intent.to[0] !== (network.testnet ? 't' : 'f')) throw new BrowserError('INVALID_ARGUMENT', 'Filecoin 地址与网络不匹配');
    const nonce = await rpc<number>(network.rpcUrl, 'Filecoin.MpoolGetNonce', [account.address]);
    const message: FilecoinMessage = { To: intent.to, From: account.address, Nonce: nonce, Value: amountToBase(intent.value, network.decimals).toString(), GasLimit: 0, GasFeeCap: '0', GasPremium: '0', Method: 0, Params: '' };
    const estimated = await rpc<FilecoinMessage>(network.rpcUrl, 'Filecoin.GasEstimateMessageGas', [message, { MaxFee: '0' }, []]);
    const fee = BigInt(estimated.GasLimit) * BigInt(estimated.GasFeeCap);
    if (BigInt(await this.balance(account, network)) < BigInt(message.Value) + fee) throw new BrowserError('CONFLICT', '余额不足以支付金额和最大网络费');
    return { to: intent.to, value: intent.value, fee: formatAmount(fee.toString(), network.decimals), payload: estimated, expiresAt: Date.now() + 120000,
      details: { recipient: intent.to, value: `${intent.value} ${network.symbol}`, maxNetworkFee: `${formatAmount(fee.toString(), network.decimals)} ${network.symbol}`, nonce: String(nonce) } };
  }
  async sign(key: KeyMaterial, network: WalletNetwork, prepared: PreparedTransfer) {
    const extended = this.key(key, network);
    const secret = extended.private_raw;
    try { return { payload: JSON.stringify(filecoinWasm().transactionSignLotus(prepared.payload as FilecoinMessage, secret)) }; }
    finally { secret.fill(0); extended.free(); }
  }
  async signMessage(): Promise<string> { throw new BrowserError('UNAVAILABLE', 'Filecoin 任意消息签名尚未建立对应业务协议'); }
  async broadcast(network: WalletNetwork, signed: SignedTransfer) {
    const result = await rpc<{ '/': string }>(network.rpcUrl, 'Filecoin.MpoolPush', [JSON.parse(signed.payload)]);
    return result['/'];
  }
  async status(network: WalletNetwork, hash: string) {
    try {
      const result = await rpc<{ Receipt?: { ExitCode: number } } | null>(network.rpcUrl, 'Filecoin.StateSearchMsg', [[], { '/': hash }, -1, true]);
      return result?.Receipt ? result.Receipt.ExitCode === 0 ? 'confirmed' as const : 'failed' as const : 'pending' as const;
    } catch { return 'unknown' as const; }
  }
  dispose() {}
}
