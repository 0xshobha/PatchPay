'use client';
import { TransactionBuilder, placeholderP2PKHUnlocker, type SpendableUtxo } from 'cashscript';
import type { DappConnectionManager } from '@wizardconnect/dapp';
import { decodeTransaction, hashTransaction, hexToBin, stringify } from '@bitauth/libauth';
import { getProvider, DUST, NETWORK } from './network';
import { addressFromPubkey } from './keys';

type HdUtxo = SpendableUtxo & { address: string; hdPath: { name: 'receive' | 'change'; addressIndex: number } };

/** Scan the first N receive/change addresses the wallet exposed over WizardConnect. */
export async function collectWalletUtxos(mgr: DappConnectionManager, scan = 20): Promise<HdUtxo[]> {
  const jobs: Promise<HdUtxo[]>[] = [];
  for (const [child, name] of [[0, 'receive'], [1, 'change']] as const) {
    for (let i = 0; i < scan; i++) {
      const pk = mgr.getPubkey(child, BigInt(i));
      if (!pk) continue;
      const address = addressFromPubkey(pk);
      jobs.push(getProvider().getUtxos(address).then((utxos) =>
        utxos.filter((u) => !u.token).map((u) => ({ ...u, address, hdPath: { name, addressIndex: i } }))));
    }
  }
  return (await Promise.all(jobs)).flat();
}

export function walletReceiveAddress(mgr: DappConnectionManager, tokenAware = false) {
  const pk = mgr.getPubkey(0, 0n);
  return pk ? addressFromPubkey(pk, tokenAware) : null;
}

/**
 * Turn a wallet-side failure into something a person can act on. The common one
 * ("Failed to decode transaction … Remaining bytes: 0") means the wallet could not
 * load the source transaction of one of its own coins from its indexer; sending
 * from the wallet's normal Send screen avoids that path entirely.
 */
export function friendlyWalletError(raw: string, escrowAddress: string, amountSats: bigint) {
  const amount = (Number(amountSats) / 1e8).toString();
  if (/decode transaction|remaining bytes|requires \d+ bytes/i.test(raw)) {
    return `Your wallet could not sign with the coins it holds — this happens when they all came from a contract payout (a known wallet limitation). Fix: use your wallet's normal Send screen to send ${amount} BCH to ${escrowAddress}, then press "Re-check chain" / "I've sent it". After that one Send, one-click backing works again. (wallet said: ${raw})`;
  }
  if (/reject|cancel|denied|declined/i.test(raw)) return 'You cancelled the payment in your wallet. Nothing was sent.';
  return `Your wallet reported an error: ${raw}`;
}

/** Build + ask the wallet to sign and broadcast the escrow funding tx. */
/**
 * Some wallets (seen with Paytaca over WizardConnect) fail to sign when a coin's
 * *source* transaction is a contract spend — e.g. a PatchPay payout, whose input
 * carries a ~330-byte covenant unlock and which has an OP_RETURN. The same coins
 * spend fine from the wallet's own Send screen. So prefer coins whose source tx is
 * a plain P2PKH payment, and use "exotic" ones only when nothing else covers it.
 */
const plainCache = new Map<string, boolean>();
async function hasPlainSource(txid: string): Promise<boolean> {
  if (plainCache.has(txid)) return plainCache.get(txid)!;
  let plain = false;
  try {
    const tx = decodeTransaction(hexToBin(await getProvider().getRawTransaction(txid)));
    plain = typeof tx !== 'string'
      && tx.inputs.every((i) => i.unlockingBytecode.length <= 150)
      && tx.outputs.every((o) => o.lockingBytecode[0] !== 0x6a);
  } catch { plain = false; }
  plainCache.set(txid, plain);
  return plain;
}

export async function fundEscrow(mgr: DappConnectionManager, escrowAddress: string, amountSats: bigint) {
  const all = await collectWalletUtxos(mgr);
  const plain = new Map(await Promise.all(all.map(async (u) => [u.txid, await hasPlainSource(u.txid)] as const)));
  // Plain-source coins first (largest first), then the rest (largest first).
  const utxos = all.sort((a, b) => Number(plain.get(b.txid)) - Number(plain.get(a.txid)) || Number(b.satoshis - a.satoshis));
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
  let res: Awaited<ReturnType<DappConnectionManager['signTransaction']>>;
  try {
    res = await mgr.signTransaction({ transaction: relaySafe, inputPaths });
  } catch (e) {
    throw new Error(friendlyWalletError((e as Error).message ?? String(e), escrowAddress, amountSats));
  }
  if (res.error) throw new Error(friendlyWalletError(res.error, escrowAddress, amountSats));
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
