import { HDNodeWallet, JsonRpcProvider, getAddress, formatUnits, parseUnits, type TransactionRequest } from 'ethers';
import type { WalletAccount, WalletNetwork } from '../../../../shared/contracts/wallet';
import { BrowserError } from '../../../../shared/errors';
import type { ChainAdapterPort, KeyMaterial, PreparedTransfer, SignedTransfer, TransferIntent } from './adapter';
import { prepareEthereumDapp } from './ethereum-dapp';

export class EthereumAdapter implements ChainAdapterPort {
  readonly chain = 'ethereum' as const;
  readonly version = 'ethers-6.17.0/eip1559';
  readonly capability = { chain: this.chain, account: true, transfer: true, messageSign: true, dapp: true, shielded: false };
  private wallet(key: KeyMaterial) { return HDNodeWallet.fromPhrase(key.mnemonic, '', `m/44'/60'/0'/0/${key.index}`); }
  async derive(key: KeyMaterial) { return this.wallet(key).address; }
  async balance(account: WalletAccount, network: WalletNetwork) {
    const provider = new JsonRpcProvider(network.rpcUrl);
    try { return (await provider.getBalance(account.address)).toString(); } finally { provider.destroy(); }
  }
  async prepare(key: KeyMaterial, account: WalletAccount, network: WalletNetwork, intent: TransferIntent): Promise<PreparedTransfer> {
    const provider = new JsonRpcProvider(network.rpcUrl);
    try {
      const address = getAddress(intent.to);
      const connected = this.wallet(key).connect(provider);
      const actual = await provider.getNetwork();
      if (network.chainId && actual.chainId !== BigInt(network.chainId)) throw new BrowserError('CONFLICT', '节点chainId与已选网络不一致');
      const transaction = await connected.populateTransaction({ to: address, value: parseUnits(intent.value, network.decimals) });
      if (transaction.from?.toLowerCase() !== account.address.toLowerCase()) throw new BrowserError('CONFLICT', '账户派生地址不一致');
      const fee = BigInt(transaction.gasLimit ?? 0) * BigInt(transaction.maxFeePerGas ?? transaction.gasPrice ?? 0);
      if (await provider.getBalance(account.address) < parseUnits(intent.value, network.decimals) + fee) throw new BrowserError('CONFLICT', '余额不足以支付金额与最大网络费');
      const payload = JSON.parse(JSON.stringify(transaction, (_name, value) => typeof value === 'bigint' ? value.toString() : value));
      return { to: address, value: intent.value, fee: formatUnits(fee, network.decimals), payload, expiresAt: Date.now() + 120000,
        details: { recipient: address, value: `${intent.value} ${network.symbol}`, maxNetworkFee: `${formatUnits(fee, network.decimals)} ${network.symbol}`, nonce: String(transaction.nonce), network: network.name } };
    } finally { provider.destroy(); }
  }
  async sign(key: KeyMaterial, _network: WalletNetwork, prepared: PreparedTransfer): Promise<SignedTransfer> {
    return { payload: await this.wallet(key).signTransaction(prepared.payload as TransactionRequest) };
  }
  async signMessage(key: KeyMaterial, _network: WalletNetwork, message: string) { return this.wallet(key).signMessage(message); }
  async signBytes(key: KeyMaterial, _network: WalletNetwork, message: Uint8Array) { return this.wallet(key).signMessage(message); }
  prepareDapp(key: KeyMaterial, account: WalletAccount, network: WalletNetwork, payload: unknown) { return prepareEthereumDapp(key, account, network, payload); }
  async broadcast(network: WalletNetwork, signed: SignedTransfer) {
    const provider = new JsonRpcProvider(network.rpcUrl);
    try { return (await provider.broadcastTransaction(signed.payload)).hash; } finally { provider.destroy(); }
  }
  async status(network: WalletNetwork, hash: string) {
    const provider = new JsonRpcProvider(network.rpcUrl);
    try {
      const receipt = await provider.getTransactionReceipt(hash);
      return receipt ? receipt.status === 1 ? 'confirmed' as const : 'failed' as const : 'pending' as const;
    } finally { provider.destroy(); }
  }
  dispose() {}
}
