// Real on-chain end-to-end test of PatchEscrow on chipnet (no mocks):
//   1. fund a fresh escrow from CHIPNET_TEST_WALLET_WIF
//   2. release it with an oracle-signed message -> payout + OP_RETURN "PPPF" + proof hash
//   3. fund a second escrow whose deadline has passed and refund it to the maintainer
// Usage:  npm run test:chipnet      (needs ~30,000 chipnet sats in the test wallet)
import pkg from '@next/env';
import fs from 'fs';
import crypto from 'crypto';
import { Contract, ElectrumNetworkProvider, SignatureTemplate, TransactionBuilder } from 'cashscript';
import { hexToBin, binToHex, sha256, utf8ToBin, secp256k1, hash160, encodeCashAddress, cashAddressToLockingBytecode } from '@bitauth/libauth';

pkg.loadEnvConfig(process.cwd());
if (process.env.NEXT_PUBLIC_BCH_NETWORK === 'mainnet') { console.error('Refusing to run: this test is chipnet-only.'); process.exit(1); }

const artifact = JSON.parse(fs.readFileSync('contracts/PatchEscrow.json', 'utf8'));
const provider = new ElectrumNetworkProvider('chipnet');
const wif = process.env.CHIPNET_TEST_WALLET_WIF;
const oracleHex = process.env.ORACLE_PRIVATE_KEY_HEX;
if (!wif || !oracleHex) { console.error('Need CHIPNET_TEST_WALLET_WIF and ORACLE_PRIVATE_KEY_HEX in .env.local'); process.exit(1); }

const wallet = new SignatureTemplate(wif);
const walletAddr = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hash160(wallet.publicKey) }).address;
const lockOf = (a) => { const r = cashAddressToLockingBytecode(a); if (typeof r === 'string') throw new Error(r); return r.bytecode; };
const oracleKey = hexToBin(oracleHex);
const oraclePk = secp256k1.derivePublicKeyCompressed(oracleKey);
const EXPLORER = (t) => `https://chipnet.imaginary.cash/tx/${t}`;
const DUST = 546n;

const ok = (m) => console.log('  ✓ ' + m);
const fail = (m) => { console.log('  ✗ ' + m); process.exitCode = 1; };

function escrow(uuid, deadline) {
  return new Contract(artifact, [sha256.hash(utf8ToBin(uuid)), oraclePk, lockOf(walletAddr), BigInt(deadline)], { provider, contractType: 'p2sh32' });
}

async function waitForUtxo(contract, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const u = (await contract.getUtxos()).filter((x) => !x.token);
    if (u.length) return u;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('escrow UTXO never appeared');
}

async function fund(toAddress, amount) {
  const utxos = (await provider.getUtxos(walletAddr)).filter((u) => !u.token).sort((a, b) => Number(b.satoshis - a.satoshis));
  const fee = 600n;
  const picked = []; let sum = 0n;
  for (const u of utxos) { picked.push(u); sum += u.satoshis; if (sum >= amount + fee + DUST) break; }
  if (sum < amount + fee) throw new Error(`test wallet has ${sum} sats, needs ${amount + fee}`);
  const b = new TransactionBuilder({ provider });
  for (const u of picked) b.addInput(u, wallet.unlockP2PKH());
  b.addOutput({ to: toAddress, amount });
  if (sum - amount - fee >= DUST) b.addOutput({ to: walletAddr, amount: sum - amount - fee });
  return (await b.send()).txid;
}

const bal = (await provider.getUtxos(walletAddr)).reduce((s, u) => s + (u.token ? 0n : u.satoshis), 0n);
console.log(`Test wallet ${walletAddr}: ${bal} sats`);
if (bal < 30000n) { console.error('Fund the test wallet from the chipnet faucet (tbch.googol.cash) with at least 30,000 sats, then rerun.'); process.exit(1); }

// ---------- 1+2: fund and release ----------
console.log('\n[release path]');
const uuidA = crypto.randomUUID();
const escA = escrow(uuidA, Math.floor(Date.now() / 1000) + 86400);
const fundA = await fund(escA.address, 12000n);
ok(`funded escrow ${escA.address} -> ${EXPLORER(fundA)}`);
const [ua] = await waitForUtxo(escA);

const proofHash = binToHex(sha256.hash(utf8ToBin(JSON.stringify({ test: 'patchpay chipnet e2e', uuidA }))));
const recipientLock = lockOf(walletAddr);
const msg = new Uint8Array([...sha256.hash(utf8ToBin(uuidA)), ...recipientLock, ...hexToBin(proofHash)]);
const sig = secp256k1.signMessageHashSchnorr(oracleKey, sha256.hash(msg));
const opReturn = hexToBin('6a04' + '50505046' + '20' + proofHash);
const rel = await new TransactionBuilder({ provider })
  .addInput(ua, escA.unlock.release(sig, recipientLock, hexToBin(proofHash)))
  .addOutput({ to: walletAddr, amount: ua.satoshis - 1500n })
  .addOutput({ to: opReturn, amount: 0n })
  .send();
ok(`released ${ua.satoshis - 1500n} sats to contributor -> ${EXPLORER(rel.txid)}`);
const raw = await provider.getRawTransaction(rel.txid);
raw.includes('6a0450505046' + '20' + proofHash) ? ok('OP_RETURN carries PPPF + proof hash on-chain') : fail('OP_RETURN with proof hash not found in tx');
// (forged-signature / wrong-recipient / early-refund rejections are covered by npm run test:contract)

// ---------- 3: refund after deadline ----------
console.log('\n[refund path]');
const deadline = Math.floor(Date.now() / 1000) - 4 * 3600; // safely behind median-time-past
const escB = escrow(crypto.randomUUID(), deadline);
const fundB = await fund(escB.address, 11000n);
ok(`funded expired escrow ${escB.address} -> ${EXPLORER(fundB)}`);
const [ub] = await waitForUtxo(escB);
const ref = await new TransactionBuilder({ provider })
  .addInput(ub, escB.unlock.refund())
  .addOutput({ to: walletAddr, amount: ub.satoshis - 1000n })
  .setLocktime(deadline)
  .send();
ok(`refunded ${ub.satoshis - 1000n} sats to maintainer -> ${EXPLORER(ref.txid)}`);

console.log(process.exitCode ? '\nCHIPNET E2E: FAILED' : '\nCHIPNET E2E: ALL PASSED');
process.exit(process.exitCode ?? 0);
