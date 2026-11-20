import {
  binToHex, hexToBin, hash160, encodeCashAddress, decodeCashAddress,
  cashAddressToLockingBytecode, sha256, utf8ToBin,
} from '@bitauth/libauth';
import { ADDRESS_PREFIX } from './network';

export const p2pkhLockFromPubkey = (pubkey: Uint8Array) =>
  hexToBin('76a914' + binToHex(hash160(pubkey)) + '88ac');

export function addressFromPubkey(pubkey: Uint8Array, tokenAware = false) {
  const res = encodeCashAddress({
    prefix: ADDRESS_PREFIX as 'bitcoincash' | 'bchtest',
    type: tokenAware ? 'p2pkhWithTokens' : 'p2pkh',
    payload: hash160(pubkey),
  });
  return res.address;
}

export function lockFromAddress(address: string): Uint8Array {
  const res = cashAddressToLockingBytecode(address);
  if (typeof res === 'string') throw new Error(`Invalid BCH address: ${res}`);
  return res.bytecode;
}

export function isValidAddress(address: string) {
  const d = decodeCashAddress(address);
  return typeof d !== 'string' && d.prefix === ADDRESS_PREFIX;
}

/** Re-encode any p2pkh cashaddr as its token-aware (p2pkhWithTokens) form. */
export function toTokenAddress(address: string): string {
  const d = decodeCashAddress(address);
  if (typeof d === 'string') throw new Error(`Invalid BCH address: ${d}`);
  const res = encodeCashAddress({
    prefix: d.prefix as 'bitcoincash' | 'bchtest',
    type: 'p2pkhWithTokens',
    payload: d.payload,
  });
  return res.address;
}

/** bytes32 bounty id used inside the contract = sha256(uuid) */
export const bountyIdBytes = (uuid: string) => sha256.hash(utf8ToBin(uuid));
