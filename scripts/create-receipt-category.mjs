// Creates a CashTokens minting NFT category from a UTXO of the RECEIPT_WALLET_WIF wallet.
// The new category id is the txid of the genesis input (outpoint index 0), per the
// CashScript convention. Print it and paste it into RECEIPT_CATEGORY in .env.local.
//
//   RECEIPT_WALLET_WIF=... NEXT_PUBLIC_BCH_NETWORK=chipnet node scripts/create-receipt-category.mjs
//
// The wallet needs at least one plain BCH UTXO at output index 0 (vout === 0) with a
// little BCH (~2000 sats) to cover the minting output + fee. On chipnet, fund it from
// the faucet (tbch.googol.cash) — send twice so a vout-0 UTXO exists.
import { SignatureTemplate, ElectrumNetworkProvider, TransactionBuilder } from 'cashscript';
import { hash160, encodeCashAddress } from '@bitauth/libauth';

const wif = process.env.RECEIPT_WALLET_WIF;
if (!wif) { console.error('RECEIPT_WALLET_WIF missing'); process.exit(1); }

const network = process.env.NEXT_PUBLIC_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';
const prefix = network === 'mainnet' ? 'bitcoincash' : 'bchtest';

const template = new SignatureTemplate(wif);
const pkh = hash160(template.publicKey);
const walletAddress = encodeCashAddress({ prefix, type: 'p2pkh', payload: pkh }).address;
const tokenAddress = encodeCashAddress({ prefix, type: 'p2pkhWithTokens', payload: pkh }).address;

const provider = new ElectrumNetworkProvider(network);
const utxos = await provider.getUtxos(walletAddress);
if (!utxos.length) {
  console.error(`No UTXOs at ${walletAddress}. Fund the receipt wallet first (chipnet faucet: tbch.googol.cash).`);
  process.exit(1);
}

const genesis = utxos.find((u) => u.vout === 0 && !u.token);
if (!genesis) {
  console.error('No eligible genesis UTXO (need one at output index 0, with no token). Send another small payment to the wallet so a vout-0 UTXO exists, then retry.');
  process.exit(1);
}

const extra = utxos.filter((u) => u !== genesis && !u.token).sort((a, b) => Number(b.satoshis - a.satoshis));
const MINT = 1000n;
const FEE = 600n;

const builder = new TransactionBuilder({ provider });
builder.addInput(genesis, template.unlockP2PKH());
let sum = genesis.satoshis;
for (const u of extra) {
  if (sum >= MINT + FEE + 546n) break;
  builder.addInput(u, template.unlockP2PKH());
  sum += u.satoshis;
}
if (sum < MINT + FEE) {
  console.error(`Receipt wallet has only ${sum} sats; needs ~${MINT + FEE + 546n}. Top it up.`);
  process.exit(1);
}

builder.addOutput({
  to: tokenAddress,
  amount: MINT,
  token: { amount: 0n, category: genesis.txid, nft: { capability: 'minting', commitment: '' } },
});
const change = sum - MINT - FEE;
if (change >= 546n) builder.addOutput({ to: walletAddress, amount: change });

const tx = await builder.send();
console.log('\nMinting NFT category created.');
console.log('  tx:', tx.txid);
console.log('  wallet token address:', tokenAddress);
console.log('\nPaste this into .env.local:\n');
console.log('RECEIPT_CATEGORY=' + genesis.txid);
