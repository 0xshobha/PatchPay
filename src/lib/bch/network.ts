import { ElectrumNetworkProvider } from 'cashscript';

// Single switch for the whole app: chipnet while building, mainnet for the demo.
export type BchNetwork = 'chipnet' | 'mainnet';

export const NETWORK: BchNetwork =
  (process.env.NEXT_PUBLIC_BCH_NETWORK as BchNetwork) === 'mainnet' ? 'mainnet' : 'chipnet';

export const ADDRESS_PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest';

export const EXPLORER_TX = (txid: string) =>
  NETWORK === 'mainnet'
    ? `https://explorer.salemkode.com/tx/${txid}`
    : `https://chipnet.imaginary.cash/tx/${txid}`;

let provider: ElectrumNetworkProvider | null = null;
export function getProvider() {
  if (!provider) provider = new ElectrumNetworkProvider(NETWORK);
  return provider;
}

export const DUST = 546n;
export const ESCROW_FEE_BUDGET = 3000n; // must match PatchEscrow.cash
export const PROOF_PREFIX_HEX = '50505046'; // "PPPF" — must match PatchEscrow.cash
