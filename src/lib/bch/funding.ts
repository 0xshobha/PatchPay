'use client';
import { TransactionBuilder, placeholderP2PKHUnlocker, type SpendableUtxo } from 'cashscript';
import type { DappConnectionManager } from '@wizardconnect/dapp';
import { hashTransaction, hexToBin, stringify } from '@bitauth/libauth';
import { getProvider, DUST, NETWORK } from './network';
import { addressFromPubkey } from './keys';

type HdUtxo = SpendableUtxo & { address: string; hdPath: { name: 'receive' | 'change'; addressIndex: number } };

/** Scan the first N receive/change addresses the wallet exposed over WizardConnect. */
export async function collectWalletUtxos(mgr: DappConnectionManager, scan = 10): Promise<HdUtxo[]> {
  const out: HdUtxo[] = [];
  for (const [child, name] of [[0, 'receive'], [1, 'change']] as const) {
    for (let i = 0; i < scan; i++) {
      const pk = mgr.getPubkey(child, BigInt(i));
      if (!pk) continue;
      const address = addressFromPubkey(pk);
      const utxos = await getProvider().getUtxos(address);
      for (const u of utxos) if (!u.token) out.push({ ...u, address, hdPath: { name, addressIndex: i } });
    }
  }
  return out;
}

export function walletReceiveAddress(mgr: DappConnectionManager, tokenAware = false) {
  const pk = mgr.getPubkey(0, 0n);
  return pk ? addressFromPubkey(pk, tokenAware) : null;
}

/** Build + ask the wallet to sign and broadcast the escrow funding tx. */
export async function fundEscrow(mgr: DappConnectionManager, escrowAddress: string, amountSats: bigint) {
  const utxos = (await collectWalletUtxos(mgr)).sort((a, b) => Number(b.satoshis - a.satoshis));
  const feeGuess = 1000n + BigInt(utxos.length) * 150n;
  const picked: HdUtxo[] = [];
  let sum = 0n;
  for (const u of utxos) { picked.push(u); sum += u.satoshis; if (sum >= amountSats + feeGuess) break; }
  if (sum < amountSats + feeGuess) {
    const fundMe = walletReceiveAddress(mgr);
    throw new Error(
      `Not enough ${NETWORK} BCH in the connected wallet: has ${(Number(sum) / 1e8).toFixed(5)}, needs ${(Number(amountSats + feeGuess) / 1e8).toFixed(5)}.` +
      (fundMe ? ` Send ${NETWORK} coins to ${fundMe}` : '') +
      (NETWORK === 'chipnet' ? ' (faucet: tbch.googol.cash, network: chipnet) and keep the wallet in chipnet mode.' : '.'),
    );
  }

  const changePk = mgr.getPubkey(1, 0n)!;
  const change = sum - amountSats - feeGuess;
  const b = new TransactionBuilder({ provider: getProvider() });
  for (const u of picked) b.addInput(u, placeholderP2PKHUnlocker(u.address));
  b.addOutput({ to: escrowAddress, amount: amountSats });
  if (change > DUST) b.addOutput({ to: addressFromPubkey(changePk), amount: change });

  // CashScript 0.14 builds the BCH-WalletConnect object; WizardConnect additionally needs
  // inputPaths = [inputIndex, pathName, addressIndex] so the HD wallet knows which key signs.
  const wc = b.generateWcTransactionObject({ broadcast: true, userPrompt: 'Lock BCH in a PatchPay bounty escrow' });
  const inputPaths = picked.map((u, i) => [i, u.hdPath.name, u.hdPath.addressIndex] as [number, 'receive' | 'change', number]);
  // The relay carries JSON, which cannot hold BigInt / Uint8Array. WizardConnect's
  // wire format is libauth "extended JSON" (<bigint: 123n>, <Uint8Array: 0x…>),
  // which is exactly what libauth's stringify() produces.
  const relaySafe = JSON.parse(stringify(wc)) as typeof wc;
  const res = await mgr.signTransaction({ transaction: relaySafe, inputPaths });
  if (res.error) throw new Error(res.error);
  if (!res.signedTransaction) throw new Error('The wallet did not return a signed transaction');

  // The wallet was asked to broadcast; broadcast again ourselves so funding never
  // depends on one wallet's behaviour. "Already known" is fine.
  const txid = hashTransaction(hexToBin(res.signedTransaction));
  try {
    await getProvider().sendRawTransaction(res.signedTransaction);
  } catch (e) {
    if (!/already|txn-already-known/i.test((e as Error).message ?? '')) throw e;
  }
  return { txid, hex: res.signedTransaction };
}
