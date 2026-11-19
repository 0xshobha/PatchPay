import 'server-only';
import { SignatureTemplate, TransactionBuilder } from 'cashscript';
import { hash160, encodeCashAddress } from '@bitauth/libauth';
import { getProvider, DUST } from './network';
import { ADDRESS_PREFIX } from './network';

function receiptTemplate() {
  const wif = process.env.RECEIPT_WALLET_WIF;
  if (!wif) throw new Error('RECEIPT_WALLET_WIF missing');
  return new SignatureTemplate(wif);
}

/**
 * Mint one immutable PatchProof NFT receipt to the contributor.
 *
 * Spends the server wallet's minting NFT (category RECEIPT_CATEGORY), recreates that
 * minting NFT back to the server wallet, and sends a fresh immutable NFT whose 32-byte
 * commitment is the PatchProof hash to `toTokenAddress` (a p2pkhWithTokens address).
 */
export async function mintReceipt(toTokenAddress: string, proofHashHex: string): Promise<string> {
  const category = process.env.RECEIPT_CATEGORY;
  if (!category) throw new Error('RECEIPT_CATEGORY missing');
  if (!/^[0-9a-f]{64}$/i.test(proofHashHex)) throw new Error('proofHash must be 32 bytes of hex');

  const template = receiptTemplate();
  const pkh = hash160(template.publicKey);
  const prefix = ADDRESS_PREFIX as 'bitcoincash' | 'bchtest';
  const walletAddress = encodeCashAddress({ prefix, type: 'p2pkh', payload: pkh }).address;
  const walletTokenAddress = encodeCashAddress({ prefix, type: 'p2pkhWithTokens', payload: pkh }).address;

  const provider = getProvider();
  const utxos = await provider.getUtxos(walletAddress);

  const mintUtxo = utxos.find((u) => u.token?.category === category && u.token?.nft?.capability === 'minting');
  if (!mintUtxo) throw new Error('No minting NFT in the receipt wallet — run scripts/create-receipt-category.mjs');

  const MINT_OUT = DUST + 254n; // 800 sats
  const RECEIPT_OUT = DUST + 254n;
  const FEE = 700n;

  const bchUtxos = utxos.filter((u) => !u.token).sort((a, b) => Number(b.satoshis - a.satoshis));
  const builder = new TransactionBuilder({ provider });
  builder.addInput(mintUtxo, template.unlockP2PKH());
  let sum = mintUtxo.satoshis;
  const need = MINT_OUT + RECEIPT_OUT + FEE;
  for (const u of bchUtxos) {
    if (sum >= need + DUST) break;
    builder.addInput(u, template.unlockP2PKH());
    sum += u.satoshis;
  }
  if (sum < need) throw new Error(`Receipt wallet needs ~${need} sats for fees; has ${sum}`);

  // Output 0: recreate the minting NFT back to the server wallet.
  builder.addOutput({
    to: walletTokenAddress,
    amount: MINT_OUT,
    token: { amount: 0n, category, nft: { capability: 'minting', commitment: mintUtxo.token?.nft?.commitment ?? '' } },
  });
  // Output 1: the immutable PatchProof receipt NFT to the contributor.
  builder.addOutput({
    to: toTokenAddress,
    amount: RECEIPT_OUT,
    token: { amount: 0n, category, nft: { capability: 'none', commitment: proofHashHex.toLowerCase() } },
  });
  // Change back to the server wallet (plain BCH).
  const change = sum - MINT_OUT - RECEIPT_OUT - FEE;
  if (change >= DUST) builder.addOutput({ to: walletAddress, amount: change });

  const tx = await builder.send();
  return tx.txid;
}
