import type { WalletNetwork } from '../../../shared/contracts/wallet';

export const defaultNetworks: WalletNetwork[] = [
  { id: 'ethereum-mainnet', chain: 'ethereum', name: 'Ethereum', rpcUrl: 'https://ethereum-mainnet.wallet.brave.com', chainId: '0x1', symbol: 'ETH', decimals: 18, testnet: false },
  { id: 'ethereum-sepolia', chain: 'ethereum', name: 'Sepolia', rpcUrl: 'https://ethereum-sepolia.wallet.brave.com', chainId: '0xaa36a7', symbol: 'ETH', decimals: 18, testnet: true },
  { id: 'solana-mainnet', chain: 'solana', name: 'Solana', rpcUrl: 'https://solana-mainnet.wallet.brave.com', symbol: 'SOL', decimals: 9, testnet: false },
  { id: 'solana-devnet', chain: 'solana', name: 'Solana Devnet', rpcUrl: 'https://api.devnet.solana.com', symbol: 'SOL', decimals: 9, testnet: true },
  { id: 'bitcoin-mainnet', chain: 'bitcoin', name: 'Bitcoin', rpcUrl: 'https://bitcoin-mainnet.wallet.brave.com/api', symbol: 'BTC', decimals: 8, testnet: false },
  { id: 'bitcoin-testnet', chain: 'bitcoin', name: 'Bitcoin Testnet', rpcUrl: 'https://blockstream.info/testnet/api', symbol: 'BTC', decimals: 8, testnet: true },
  { id: 'filecoin-mainnet', chain: 'filecoin', name: 'Filecoin', rpcUrl: 'https://api.node.glif.io/rpc/v0', symbol: 'FIL', decimals: 18, testnet: false },
  { id: 'filecoin-testnet', chain: 'filecoin', name: 'Filecoin Calibration', rpcUrl: 'https://api.calibration.node.glif.io/rpc/v0', symbol: 'FIL', decimals: 18, testnet: true },
  { id: 'cardano-mainnet', chain: 'cardano', name: 'Cardano', rpcUrl: 'https://cardano-mainnet.wallet.brave.com', symbol: 'ADA', decimals: 6, testnet: false },
  { id: 'cardano-testnet', chain: 'cardano', name: 'Cardano Preprod', rpcUrl: 'https://cardano-preprod.wallet.brave.com', symbol: 'ADA', decimals: 6, testnet: true },
  { id: 'polkadot-mainnet', chain: 'polkadot', name: 'Polkadot', rpcUrl: 'https://polkadot-mainnet.wallet.brave.com', symbol: 'DOT', decimals: 10, testnet: false },
  { id: 'polkadot-westend', chain: 'polkadot', name: 'Westend', rpcUrl: 'https://polkadot-westend.wallet.brave.com', symbol: 'WND', decimals: 12, testnet: true },
  { id: 'zcash-mainnet', chain: 'zcash', name: 'Zcash', rpcUrl: 'https://zcash.wallet.brave.com', symbol: 'ZEC', decimals: 8, testnet: false },
  { id: 'zcash-testnet', chain: 'zcash', name: 'Zcash Testnet', rpcUrl: 'https://testnet.zec.rocks', symbol: 'ZEC', decimals: 8, testnet: true },
];
