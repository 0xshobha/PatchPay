// Runs the PatchEscrow contract against CashScript's MockNetworkProvider.
// node test/escrow.test.mjs
import { readFileSync } from 'node:fs';
import {
  Contract, MockNetworkProvider, TransactionBuilder, randomUtxo,
} from 'cashscript';
import {
  secp256k1, sha256, hexToBin, binToHex, cashAddressToLockingBytecode,
  generatePrivateKey, encodeCashAddress, hash160, utf8ToBin,
} from '@bitauth/libauth';

const artifact = JSON.parse(readFileSync(new URL('../contracts/PatchEscrow.json', import.meta.url)));

const priv = () => generatePrivateKey();
const pub = (k) => secp256k1.derivePublicKeyCompressed(k);
const p2pkhLock = (pk) => hexToBin('76a914' + binToHex(hash160(pk)) + '88ac');
const addrOf = (pk) => encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hash160(pk) }).address;

const oracleKey = priv();
const maintainerKey = priv();
const contributorKey = priv();

const bountyId = sha256.hash(utf8ToBin('bounty-uuid-123'));
const proofHash = sha256.hash(utf8ToBin('{"patchproof":"demo"}'));
const maintainerLock = p2pkhLock(pub(maintainerKey));
const recipientLock = p2pkhLock(pub(contributorKey));
const deadline = 1_800_000_000n;

const provider = new MockNetworkProvider();
const contract = new Contract(artifact, [bountyId, pub(oracleKey), maintainerLock, deadline], { provider });

provider.addUtxo(contract.address, randomUtxo({ satoshis: 100_000n }));
const [utxo] = await contract.getUtxos();

const signOracle = (msg) => secp256k1.signMessageHashSchnorr(oracleKey, sha256.hash(msg));
const nulldata = (h) => hexToBin('6a' + '04' + '50505046' + '20' + binToHex(h));

let pass = 0, fail = 0;
const expectOk = async (name, fn) => { try { await fn(); console.log('PASS', name); pass++; } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); fail++; } };
const expectErr = async (name, fn) => { try { await fn(); console.log('FAIL (should have reverted)', name); fail++; } catch (e) { console.log('PASS', name, '->', e.message.split('\n')[0].slice(0,90)); pass++; } };

// 1. wrong recipient must fail
await expectErr('release to attacker address reverts', async () => {
  const sig = signOracle(new Uint8Array([...bountyId, ...recipientLock, ...proofHash]));
  await new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.release(sig, recipientLock, proofHash))
    .addOutput({ to: addrOf(pub(oracleKey)), amount: 98_000n })
    .addOutput({ to: nulldata(proofHash), amount: 0n })
    .send();
});

// 2. bad oracle signature must fail
await expectErr('release with forged signature reverts', async () => {
  const fake = secp256k1.signMessageHashSchnorr(priv(), sha256.hash(new Uint8Array([...bountyId, ...recipientLock, ...proofHash])));
  await new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.release(fake, recipientLock, proofHash))
    .addOutput({ to: addrOf(pub(contributorKey)), amount: 98_000n })
    .addOutput({ to: nulldata(proofHash), amount: 0n })
    .send();
});

// 3. refund before deadline must fail
await expectErr('refund before deadline reverts', async () => {
  await new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.refund())
    .addOutput({ to: maintainerLock, amount: 98_000n })
    .setLocktime(1_700_000_000)
    .send();
});

// 4. refund after deadline to the maintainer succeeds
await expectOk('refund after deadline succeeds (build only)', async () => {
  new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.refund())
    .addOutput({ to: maintainerLock, amount: 98_000n })
    .setLocktime(Number(deadline) + 10)
    .build();
});

// 5. valid release succeeds
await expectOk('valid oracle-signed release pays contributor', async () => {
  const sig = signOracle(new Uint8Array([...bountyId, ...recipientLock, ...proofHash]));
  const tx = await new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.release(sig, recipientLock, proofHash))
    .addOutput({ to: addrOf(pub(contributorKey)), amount: 98_000n })
    .addOutput({ to: nulldata(proofHash), amount: 0n })
    .send();
  if (!tx.txid) throw new Error('no txid');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
