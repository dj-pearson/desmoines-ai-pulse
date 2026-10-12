/**
 * App Store JWS chain verification (_shared/appleJws.ts).
 *
 * The old verifier in appstore-server-notifications-v2 checked only that the
 * LAST x5c certificate was Apple's root and the JWS verified with the FIRST,
 * so an attacker's own leaf with Apple's public root appended passed. These
 * tests mint a throwaway root -> intermediate -> leaf hierarchy shaped like
 * Apple's (P-384 root and intermediate, P-256 leaf, ecdsa-with-SHA384 cert
 * signatures, Apple's marker OIDs) and inject that root as the trust anchor.
 * The attack cases run against the production default, the real Apple root.
 *
 * Run: `deno test --allow-read supabase/functions/_shared/appleJws.test.ts`
 */
import { assert, assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import {
  APPLE_ROOT_CA_G3_B64,
  APPLE_ROOT_CA_G3_SHA256,
  base64ToBytes,
  derEcdsaSignatureToRaw,
  OID_APPLE_INTERMEDIATE_MARKER,
  OID_APPLE_LEAF_MARKER,
  parseCertificate,
  verifyAppleJWS,
  verifyIssuedBy,
} from './appleJws.ts';

// Apple Worldwide Developer Relations CA - G6, the real intermediate that signs
// App Store leaf certificates. Public, from
// https://www.apple.com/certificateauthority/AppleWWDRCAG6.cer
// SHA-256 bdd4ed6e74691f0c2bfd01be0296197af1379e0418e2d300efa9c3bef642ca30
const APPLE_WWDR_G6_B64 =
  'MIIDFjCCApygAwIBAgIUIsGhRwp0c2nvU4YSycafPTjzbNcwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMjEwMzE3MjAzNzEwWhcNMzYwMzE5MDAwMDAwWjB1MUQwQgYDVQQDDDtBcHBsZSBXb3JsZHdpZGUgRGV2ZWxvcGVyIFJlbGF0aW9ucyBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTELMAkGA1UECwwCRzYxEzARBgNVBAoMCkFwcGxlIEluYy4xCzAJBgNVBAYTAlVTMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEbsQKC94PrlWmZXnXgtxzdVJL8T0SGYngDRGpngn3N6PT8JMEb7FDi4bBmPhCnZ3/sq6PF/cGcKXWsL5vOteRhyJ45x3ASP7cOB+aao90fcpxSv/EZFbniAbNgZGhIhpIo4H6MIH3MBIGA1UdEwEB/wQIMAYBAf8CAQAwHwYDVR0jBBgwFoAUu7DeoVgziJqkipnevr3rr9rLJKswRgYIKwYBBQUHAQEEOjA4MDYGCCsGAQUFBzABhipodHRwOi8vb2NzcC5hcHBsZS5jb20vb2NzcDAzLWFwcGxlcm9vdGNhZzMwNwYDVR0fBDAwLjAsoCqgKIYmaHR0cDovL2NybC5hcHBsZS5jb20vYXBwbGVyb290Y2FnMy5jcmwwHQYDVR0OBBYEFD8vlCNR01DJmig97bB85c+lkGKZMA4GA1UdDwEB/wQEAwIBBjAQBgoqhkiG92NkBgIBBAIFADAKBggqhkjOPQQDAwNoADBlAjBAXhSq5IyKogMCPtw490BaB677CaEGJXufQB/EqZGd6CSjiCtOnuMTbXVXmxxcxfkCMQDTSPxarZXvNrkxU3TkUMI33yzvFVVRT4wxWJC994OsdcZ4+RGNsYDyR5gmdr0nDGg=';

// ---------------------------------------------------------------------------
// DER builder (test-only)
// ---------------------------------------------------------------------------

const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function tlv(tag: number, ...body: Uint8Array[]): Uint8Array {
  const c = concat(...body);
  let len: number[];
  if (c.length < 0x80) len = [c.length];
  else if (c.length < 0x100) len = [0x81, c.length];
  else len = [0x82, c.length >> 8, c.length & 0xff];
  return concat(new Uint8Array([tag, ...len]), c);
}

const seq = (...b: Uint8Array[]) => tlv(0x30, ...b);

function oid(dotted: string): Uint8Array {
  const arcs = dotted.split('.').map(Number);
  const out = [arcs[0] * 40 + arcs[1]];
  for (const a of arcs.slice(2)) {
    const stack = [a & 0x7f];
    let v = Math.floor(a / 128);
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    out.push(...stack);
  }
  return tlv(0x06, new Uint8Array(out));
}

function int(n: number): Uint8Array {
  const bytes: number[] = [];
  do {
    bytes.unshift(n & 0xff);
    n = Math.floor(n / 256);
  } while (n > 0);
  if (bytes[0] & 0x80) bytes.unshift(0);
  return tlv(0x02, new Uint8Array(bytes));
}

function time(ms: number): Uint8Array {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  const rest = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  const y = d.getUTCFullYear();
  return y >= 1950 && y < 2050
    ? tlv(0x17, new TextEncoder().encode(`${p(y % 100)}${rest}`))
    : tlv(0x18, new TextEncoder().encode(`${y}${rest}`));
}

const name = (cn: string) => seq(tlv(0x31, seq(oid('2.5.4.3'), tlv(0x0c, new TextEncoder().encode(cn)))));

function ext(id: string, critical: boolean, value: Uint8Array): Uint8Array {
  return critical ? seq(oid(id), tlv(0x01, new Uint8Array([0xff])), tlv(0x04, value)) : seq(oid(id), tlv(0x04, value));
}

function rawToDerSig(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  const enc = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const v = b.subarray(i);
    return tlv(0x02, v[0] & 0x80 ? concat(new Uint8Array([0]), v) : v);
  };
  return seq(enc(raw.subarray(0, half)), enc(raw.subarray(half)));
}

const ECDSA_SHA384 = '1.2.840.10045.4.3.3';
const DAY = 86_400_000;
const NOW = Date.now();

interface Cert {
  der: Uint8Array;
  keys: CryptoKeyPair;
  cn: string;
}

async function keyPair(curve: 'P-256' | 'P-384'): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: curve }, true, ['sign', 'verify']);
}

async function makeCert(o: {
  cn: string;
  keys: CryptoKeyPair;
  issuerCn: string;
  issuerKey: CryptoKey;
  /** Exact issuer Name DER; overrides issuerCn. */
  issuerName?: Uint8Array;
  ca?: boolean;
  marker?: string | null;
  notBefore?: number;
  notAfter?: number;
  serial?: number;
}): Promise<Cert> {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', o.keys.publicKey));
  const exts: Uint8Array[] = [];
  if (o.ca !== undefined) {
    exts.push(ext('2.5.29.19', true, o.ca ? seq(tlv(0x01, new Uint8Array([0xff]))) : seq()));
  }
  if (o.marker) exts.push(ext(o.marker, false, tlv(0x05)));
  const sigAlg = seq(oid(ECDSA_SHA384));
  const tbs = seq(
    tlv(0xa0, int(2)),
    int(o.serial ?? 1),
    sigAlg,
    o.issuerName ?? name(o.issuerCn),
    seq(time(o.notBefore ?? NOW - 365 * DAY), time(o.notAfter ?? NOW + 365 * DAY)),
    name(o.cn),
    spki,
    ...(exts.length ? [tlv(0xa3, seq(...exts))] : []),
  );
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-384' }, o.issuerKey, ab(tbs)));
  const der = seq(tbs, sigAlg, tlv(0x03, new Uint8Array([0]), rawToDerSig(raw)));
  return { der, keys: o.keys, cn: o.cn };
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const b64url = (b: Uint8Array) => b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function makeJws(payload: unknown, signer: CryptoKey, chain: Uint8Array[], alg = 'ES256'): Promise<string> {
  const head = enc({ alg, x5c: chain.map(b64) });
  const body = enc(payload);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer, new TextEncoder().encode(`${head}.${body}`)),
  );
  return `${head}.${body}.${b64url(sig)}`;
}

/** A hierarchy shaped like Apple's. Overrides let a case break one link. */
async function hierarchy(over: {
  leaf?: Partial<Parameters<typeof makeCert>[0]>;
  intermediate?: Partial<Parameters<typeof makeCert>[0]>;
} = {}) {
  const rootKeys = await keyPair('P-384');
  const root = await makeCert({ cn: 'Test Root', keys: rootKeys, issuerCn: 'Test Root', issuerKey: rootKeys.privateKey, ca: true });
  const intKeys = await keyPair('P-384');
  const intermediate = await makeCert({
    cn: 'Test WWDR',
    keys: intKeys,
    issuerCn: root.cn,
    issuerKey: rootKeys.privateKey,
    ca: true,
    marker: OID_APPLE_INTERMEDIATE_MARKER,
    ...over.intermediate,
  });
  const leafKeys = await keyPair('P-256');
  const leaf = await makeCert({
    cn: 'Test Leaf',
    keys: leafKeys,
    issuerCn: intermediate.cn,
    issuerKey: intKeys.privateKey,
    ca: false,
    marker: OID_APPLE_LEAF_MARKER,
    ...over.leaf,
  });
  return { root, intermediate, leaf, rootKeys, intKeys, leafKeys };
}

const PAYLOAD = { notificationType: 'REFUND', notificationUUID: 'u-1', signedDate: NOW };

// ---------------------------------------------------------------------------
// Trust anchor
// ---------------------------------------------------------------------------

Deno.test('pinned Apple Root CA - G3 bytes match the published SHA-256 fingerprint', async () => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', ab(base64ToBytes(APPLE_ROOT_CA_G3_B64))));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  assertEquals(hex, APPLE_ROOT_CA_G3_SHA256);
});

Deno.test("Apple's real WWDR G6 intermediate verifies under the real G3 root (P-384, ecdsa-with-SHA384)", async () => {
  const root = parseCertificate(base64ToBytes(APPLE_ROOT_CA_G3_B64));
  const g6 = parseCertificate(base64ToBytes(APPLE_WWDR_G6_B64));
  assert(root.isCA);
  assert(g6.isCA);
  assert(g6.extensionOids.has(OID_APPLE_INTERMEDIATE_MARKER));
  assertEquals(await verifyIssuedBy(g6, root), true);
  // Counter-assertion: the root is not signed by G6, so the check can say no.
  assertEquals(await verifyIssuedBy(root, g6), false);
});

// ---------------------------------------------------------------------------
// Accept
// ---------------------------------------------------------------------------

Deno.test('a valid leaf <- intermediate <- root chain passes and returns the payload', async () => {
  const h = await hierarchy();
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  assertEquals(await verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), PAYLOAD);
});

Deno.test('validity is judged at signedDate: a leaf expired today still verifies a payload signed while it was valid', async () => {
  const h = await hierarchy({ leaf: { notBefore: NOW - 30 * DAY, notAfter: NOW - DAY } });
  const old = { ...PAYLOAD, signedDate: NOW - 10 * DAY };
  const jws = await makeJws(old, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  assertEquals(await verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), old);
});

// ---------------------------------------------------------------------------
// The reported attack
// ---------------------------------------------------------------------------

Deno.test('ATTACK: self-signed leaf + real Apple intermediate + real Apple root is refused (production roots)', async () => {
  const keys = await keyPair('P-256');
  const leaf = await makeCert({
    cn: 'Prod ECC Mac App Store and iTunes Store Receipt Signing',
    keys,
    issuerCn: 'Prod ECC Mac App Store and iTunes Store Receipt Signing',
    issuerKey: keys.privateKey,
    marker: OID_APPLE_LEAF_MARKER,
  });
  const jws = await makeJws(PAYLOAD, keys.privateKey, [
    leaf.der,
    base64ToBytes(APPLE_WWDR_G6_B64),
    base64ToBytes(APPLE_ROOT_CA_G3_B64),
  ]);
  await assertRejects(() => verifyAppleJWS(jws), Error, 'Leaf certificate is not signed by the intermediate');
});

Deno.test('ATTACK: forged leaf naming Apple WWDR as issuer + real intermediate + real root is refused', async () => {
  const keys = await keyPair('P-256');
  const forger = await keyPair('P-384');
  const leaf = await makeCert({
    cn: 'Forged Leaf',
    keys,
    // The issuer Name is G6's exact subject bytes, so the name check passes
    // and only the signature check can refuse it.
    issuerCn: 'unused',
    issuerName: parseCertificate(base64ToBytes(APPLE_WWDR_G6_B64)).subject,
    issuerKey: forger.privateKey,
    marker: OID_APPLE_LEAF_MARKER,
  });
  const jws = await makeJws(PAYLOAD, keys.privateKey, [
    leaf.der,
    base64ToBytes(APPLE_WWDR_G6_B64),
    base64ToBytes(APPLE_ROOT_CA_G3_B64),
  ]);
  await assertRejects(() => verifyAppleJWS(jws), Error, 'not signed by the intermediate');
});

Deno.test("ATTACK: attacker's own intermediate + real Apple root is refused (production roots)", async () => {
  const h = await hierarchy();
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [
    h.leaf.der,
    h.intermediate.der,
    base64ToBytes(APPLE_ROOT_CA_G3_B64),
  ]);
  await assertRejects(() => verifyAppleJWS(jws), Error, 'Intermediate certificate is not signed by the trusted root');
});

// ---------------------------------------------------------------------------
// Broken links
// ---------------------------------------------------------------------------

Deno.test('a leaf not signed by the intermediate fails (same issuer name, different key)', async () => {
  const rogue = await keyPair('P-384');
  const h = await hierarchy({ leaf: { issuerKey: rogue.privateKey } });
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(
    () => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }),
    Error,
    'Leaf certificate is not signed by the intermediate',
  );
});

Deno.test('an intermediate not signed by the root fails (same issuer name, different key)', async () => {
  const rogue = await keyPair('P-384');
  const h = await hierarchy({ intermediate: { issuerKey: rogue.privateKey } });
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(
    () => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }),
    Error,
    'Intermediate certificate is not signed by the trusted root',
  );
});

Deno.test('a leaf whose issuer name is not the intermediate subject fails even when the key matches', async () => {
  const h = await hierarchy({ leaf: { issuerCn: 'Someone Else' } });
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), Error, 'not signed by the intermediate');
});

Deno.test('a root in x5c that is not the pinned root fails', async () => {
  const h = await hierarchy();
  const other = await hierarchy();
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(jws, { trustedRoots: [other.root.der] }), Error, 'not a trusted root');
});

// ---------------------------------------------------------------------------
// Validity periods
// ---------------------------------------------------------------------------

Deno.test('an expired leaf fails', async () => {
  const h = await hierarchy({ leaf: { notBefore: NOW - 30 * DAY, notAfter: NOW - DAY } });
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), Error, 'Leaf certificate has expired');
});

Deno.test('an expired intermediate fails', async () => {
  const h = await hierarchy({ intermediate: { notBefore: NOW - 30 * DAY, notAfter: NOW - DAY } });
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(
    () => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }),
    Error,
    'Intermediate certificate has expired',
  );
});

Deno.test('a leaf not yet valid fails', async () => {
  const h = await hierarchy({ leaf: { notBefore: NOW + DAY, notAfter: NOW + 30 * DAY } });
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), Error, 'not yet valid');
});

Deno.test('with no signedDate, validity is judged at now', async () => {
  const h = await hierarchy({ leaf: { notBefore: NOW - 30 * DAY, notAfter: NOW - DAY } });
  const jws = await makeJws({ notificationUUID: 'u-2' }, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), Error, 'expired');
});

// ---------------------------------------------------------------------------
// Constraints and markers
// ---------------------------------------------------------------------------

Deno.test('an intermediate without basicConstraints cA=TRUE fails', async () => {
  const h = await hierarchy({ intermediate: { ca: false } });
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), Error, 'not a CA');
});

Deno.test("an intermediate without Apple's WWDR marker OID fails", async () => {
  const h = await hierarchy({ intermediate: { marker: null } });
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), Error, 'WWDR marker OID');
});

Deno.test("a leaf without Apple's receipt-signing marker OID fails", async () => {
  const h = await hierarchy({ leaf: { marker: null } });
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), Error, 'receipt-signing marker OID');
});

// ---------------------------------------------------------------------------
// The JWS itself
// ---------------------------------------------------------------------------

Deno.test('a tampered payload fails', async () => {
  const h = await hierarchy();
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  const [head, , sig] = jws.split('.');
  const forged = `${head}.${enc({ ...PAYLOAD, notificationType: 'DID_RENEW' })}.${sig}`;
  await assertRejects(
    () => verifyAppleJWS(forged, { trustedRoots: [h.root.der] }),
    Error,
    'JWS signature verification failed',
  );
});

Deno.test('a JWS signed by a key other than the leaf fails', async () => {
  const h = await hierarchy();
  const other = await keyPair('P-256');
  const jws = await makeJws(PAYLOAD, other.privateKey, [h.leaf.der, h.intermediate.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), Error, 'JWS signature verification failed');
});

Deno.test('alg other than ES256 fails', async () => {
  const h = await hierarchy();
  const jws = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.root.der], 'none');
  await assertRejects(() => verifyAppleJWS(jws, { trustedRoots: [h.root.der] }), Error, 'Unsupported JWS algorithm');
});

Deno.test('x5c with anything but exactly three certificates fails', async () => {
  const h = await hierarchy();
  const two = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(two, { trustedRoots: [h.root.der] }), Error, 'exactly [leaf, intermediate, root]');
  const four = await makeJws(PAYLOAD, h.leafKeys.privateKey, [h.leaf.der, h.intermediate.der, h.intermediate.der, h.root.der]);
  await assertRejects(() => verifyAppleJWS(four, { trustedRoots: [h.root.der] }), Error, 'exactly [leaf, intermediate, root]');
});

// ---------------------------------------------------------------------------
// DER reader
// ---------------------------------------------------------------------------

Deno.test('DER reader refuses truncated and trailing bytes', () => {
  const der = base64ToBytes(APPLE_ROOT_CA_G3_B64);
  assertThrows(() => parseCertificate(der.subarray(0, der.length - 1)));
  assertThrows(() => parseCertificate(concat(der, new Uint8Array([0]))), Error, 'trailing bytes');
  // Control: the untouched bytes parse.
  assertEquals(parseCertificate(der).isCA, true);
});

Deno.test('DER ECDSA signature converts to fixed-width r||s', () => {
  // r = 0x00ff (leading zero for sign), s = 0x01
  const der = seq(tlv(0x02, new Uint8Array([0x00, 0xff])), tlv(0x02, new Uint8Array([0x01])));
  const raw = derEcdsaSignatureToRaw(der, 4);
  assertEquals(Array.from(raw), [0, 0, 0, 0xff, 0, 0, 0, 1]);
  assertThrows(() => derEcdsaSignatureToRaw(seq(tlv(0x02, new Uint8Array(5).fill(1)), tlv(0x02, new Uint8Array([1]))), 4));
});

// ---------------------------------------------------------------------------
// The webhook uses this verifier and no longer carries its own
// ---------------------------------------------------------------------------

Deno.test('appstore-server-notifications-v2 imports verifyAppleJWS from _shared and has no local x5c handling', async () => {
  const src = await Deno.readTextFile(new URL('../appstore-server-notifications-v2/index.ts', import.meta.url));
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(/import\s*\{\s*verifyAppleJWS\s*\}\s*from\s*'\.\.\/_shared\/appleJws\.ts'/.test(code));
  assert(!/function\s+verifyAppleJWS/.test(code), 'local verifyAppleJWS is back');
  assert(!/x5c/.test(code), 'webhook handles x5c itself again');
  // Counter-assertion: the same probes fire on the shape that was removed.
  const old = "async function verifyAppleJWS(jws) { const r = header.x5c[header.x5c.length - 1]; }";
  assert(/function\s+verifyAppleJWS/.test(old) && /x5c/.test(old));
});
