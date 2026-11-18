import 'server-only';
import { secp256k1, sha256, hexToBin, binToHex } from '@bitauth/libauth';
import { bountyIdBytes, lockFromAddress } from './keys';

// The oracle key lives ONLY in server env (ORACLE_PRIVATE_KEY_HEX).
// It never touches the AI layer, the browser, or GitHub Actions.
function oracleKey() {
  const hex = process.env.ORACLE_PRIVATE_KEY_HEX;
  if (!hex || hex.length !== 64) throw new Error('ORACLE_PRIVATE_KEY_HEX missing');
  return hexToBin(hex);
}

export function oraclePubkeyHex() {
  const pk = secp256k1.derivePublicKeyCompressed(oracleKey());
  if (typeof pk === 'string') throw new Error(pk);
  return binToHex(pk);
}

/** message = bountyId(32) ++ recipientLock ++ proofHash(32); OP_CHECKDATASIG sha256s it. */
export function signRelease(bountyUuid: string, recipientAddress: string, proofHashHex: string) {
  const msg = new Uint8Array([
    ...bountyIdBytes(bountyUuid),
    ...lockFromAddress(recipientAddress),
    ...hexToBin(proofHashHex),
  ]);
  const sig = secp256k1.signMessageHashSchnorr(oracleKey(), sha256.hash(msg));
  if (typeof sig === 'string') throw new Error(sig);
  return { sig, sigHex: binToHex(sig), messageHex: binToHex(msg) };
}
