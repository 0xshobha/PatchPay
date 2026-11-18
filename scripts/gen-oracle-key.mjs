// node scripts/gen-oracle-key.mjs  → prints a fresh oracle key pair for .env.local
import { generatePrivateKey, secp256k1, binToHex } from '@bitauth/libauth';
const k = generatePrivateKey();
console.log('ORACLE_PRIVATE_KEY_HEX=' + binToHex(k));
console.log('# public key (shown on every docket):', binToHex(secp256k1.derivePublicKeyCompressed(k)));
