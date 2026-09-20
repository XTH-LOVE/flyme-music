/**
 * Netease weapi crypto - the single implementation shared by the packaged
 * app and the browser dev flow. Ported from the vite dev middleware; the
 * AES/RSA constants are Netease's public client constants.
 */
export const WEAPI_NONCE = '0CoJUm6Qyw8W8jud';
export const WEAPI_IV = '0102030405060708';
const PUB_KEY = '010001';
const MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7' +
  'b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280' +
  '104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932' +
  '575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b' +
  '3ece0462db0a22b8e7';

/**
 * Netease's alphabet intentionally omits '8'.
 * Math.random() is deliberate: secKey/nuid only obfuscate requests and mark an
 * anonymous visitor - they protect no user secret, and this keeps byte-parity
 * with the ported Node impl (and deterministic golden tests via stubbing).
 */
function randomKey(size: number): string {
  const choice = '012345679abcdef';
  let out = '';
  for (let i = 0; i < size; i += 1) out += choice[Math.floor(Math.random() * choice.length)];
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

/** AES-128-CBC + PKCS#7, matching Node's createCipheriv used by the dev proxy. */
export async function aesEncryptBase64(text: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'AES-CBC', length: 128 },
    false,
    ['encrypt'],
  );
  const buf = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: enc.encode(WEAPI_IV) },
    cryptoKey,
    enc.encode(text),
  );
  return toBase64(new Uint8Array(buf));
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function rsaEncrypt(secKey: string): string {
  const reversed = new TextEncoder().encode(secKey.split('').reverse().join(''));
  let hex = '';
  reversed.forEach((b) => { hex += b.toString(16).padStart(2, '0'); });
  const enc = modPow(BigInt('0x' + hex), BigInt('0x' + PUB_KEY), BigInt('0x' + MODULUS));
  return enc.toString(16).padStart(256, '0');
}

/** A type alias (not an interface) so it satisfies URLSearchParams init. */
export type WeapiPayload = {
  params: string;
  encSecKey: string;
};

/** Double-AES + RSA envelope required by every /weapi/ endpoint. */
export async function encryptWeapi(object: unknown): Promise<WeapiPayload> {
  const text = JSON.stringify(object);
  const secKey = randomKey(16);
  const enc1 = await aesEncryptBase64(text, WEAPI_NONCE);
  const enc2 = await aesEncryptBase64(enc1, secKey);
  return { params: enc2, encSecKey: rsaEncrypt(secKey) };
}

/** Body for Content-Type: application/x-www-form-urlencoded. */
export async function weapiForm(object: unknown): Promise<string> {
  const payload = await encryptWeapi(object);
  return new URLSearchParams(payload).toString();
}

/** Anonymous pc-client markers; Netease rejects requests without them. */
export function buildVisitorCookie(): string {
  const nuid = randomKey(32);
  const nnid = nuid + ',' + Date.now();
  return 'os=pc; appver=2.9.7; mode=31; _ntes_nuid=' + nuid + '; _ntes_nnid3=' + nnid + '; NMTID=0;';
}
