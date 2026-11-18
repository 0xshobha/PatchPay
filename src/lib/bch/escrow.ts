import { Contract, TransactionBuilder } from 'cashscript';
import { binToHex, hexToBin } from '@bitauth/libauth';
import artifact from './PatchEscrow.artifact';
import { getProvider, ESCROW_FEE_BUDGET, PROOF_PREFIX_HEX, DUST } from './network';
import { bountyIdBytes, lockFromAddress } from './keys';

export interface EscrowParams {
  bountyUuid: string;
  oraclePubkeyHex: string;
  maintainerAddress: string;
  deadlineUnix: number;
}

/** Deterministic: the same params always give the same escrow address. */
export function escrowContract(p: EscrowParams) {
  return new Contract(
    artifact,
    [
      bountyIdBytes(p.bountyUuid),
      hexToBin(p.oraclePubkeyHex),
      lockFromAddress(p.maintainerAddress),
      BigInt(p.deadlineUnix),
    ],
    { provider: getProvider(), contractType: 'p2sh32' },
  );
}

export async function escrowBalance(p: EscrowParams) {
  const c = escrowContract(p);
  const utxos = await c.getUtxos();
  const total = utxos.reduce((s, u) => s + u.satoshis, 0n);
  return { address: c.address, utxos, total };
}

const proofNullData = (proofHashHex: string) =>
  hexToBin('6a' + '04' + PROOF_PREFIX_HEX + '20' + proofHashHex);

/**
 * Server-side: spend every escrow UTXO to the contributor.
 * One tx per UTXO because the contract enforces tx.inputs.length == 1.
 * oracleSigFor(utxo) must return a 64-byte Schnorr datasig over
 * bountyId ++ recipientLock ++ proofHash (see oracle.ts).
 */
export async function releaseEscrow(
  p: EscrowParams,
  recipientAddress: string,
  proofHashHex: string,
  oracleSig: Uint8Array,
) {
  const c = escrowContract(p);
  const recipientLock = lockFromAddress(recipientAddress);
  const utxos = await c.getUtxos();
  if (!utxos.length) throw new Error('Escrow is empty');
  const txids: string[] = [];
  for (const u of utxos) {
    const fee = 1500n;
    const amount = u.satoshis - fee;
    if (amount < DUST || fee > ESCROW_FEE_BUDGET) continue;
    const tx = await new TransactionBuilder({ provider: getProvider() })
      .addInput(u, c.unlock.release(oracleSig, recipientLock, hexToBin(proofHashHex)))
      .addOutput({ to: recipientAddress, amount })
      .addOutput({ to: proofNullData(proofHashHex), amount: 0n })
      .send();
    txids.push(tx.txid);
  }
  return txids;
}

/** Permissionless refund after the deadline (anyone can call; funds only go to the maintainer). */
export async function refundEscrow(p: EscrowParams) {
  const c = escrowContract(p);
  const utxos = await c.getUtxos();
  const txids: string[] = [];
  for (const u of utxos) {
    const amount = u.satoshis - 1000n;
    if (amount < DUST) continue;
    const tx = await new TransactionBuilder({ provider: getProvider() })
      .addInput(u, c.unlock.refund())
      .addOutput({ to: p.maintainerAddress, amount })
      .setLocktime(Math.max(p.deadlineUnix, Math.floor(Date.now() / 1000) - 600))
      .send();
    txids.push(tx.txid);
  }
  return txids;
}

export const toHex = binToHex;
