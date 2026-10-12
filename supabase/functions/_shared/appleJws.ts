/**
 * Verify a JWS signed by the App Store (App Store Server Notifications v2,
 * and the signedTransactionInfo / signedRenewalInfo inside them).
 *
 * THE DEFECT THIS REPLACES. appstore-server-notifications-v2 used to check
 * that the LAST certificate in the JWS `x5c` header had Apple Root CA - G3's
 * fingerprint, then verify the JWS with the FIRST certificate's key. Nothing
 * tied the two together. Apple's root is public, so
 * `x5c = [attacker's self-made leaf, anything, Apple root]` signed with the
 * attacker's own key passed, and the payload went straight into
 * user_subscriptions.
 *
 * WHAT IS CHECKED NOW, mirroring Apple's app-store-server-library
 * (SignedDataVerifier.verifyCertificateChain):
 *   - header alg is ES256 and x5c holds exactly [leaf, intermediate, root];
 *   - the root byte-equals a pinned trusted root (Apple Root CA - G3 in
 *     production; tests inject their own);
 *   - intermediate is signed by the root's key, leaf by the intermediate's
 *     key, and each cert's issuer Name byte-equals its signer's subject Name;
 *   - every cert is inside its validity period at the effective date, which
 *     is the payload's signedDate when it has one, else now (Apple's offline
 *     mode does the same, so a retried notification is judged at the time
 *     Apple signed it);
 *   - the intermediate is a CA (basicConstraints cA = TRUE) and carries
 *     Apple's WWDR marker OID 1.2.840.113635.100.6.2.1;
 *   - the leaf carries Apple's receipt-signing marker OID
 *     1.2.840.113635.100.6.11.1 and has a P-256 key;
 *   - finally the JWS signature (raw r||s, ES256) verifies with the leaf key.
 *
 * WHY A HAND-WRITTEN DER READER. No X.509 library is in the repo, and
 * node:crypto's X509Certificate is not something this repo can verify on the
 * Supabase edge runtime. The reader below handles only definite-length DER,
 * bounds-checks every length against its parent, and rejects trailing bytes.
 * appleJws.test.ts builds certificates from scratch to exercise it, and also
 * checks Apple's real WWDR G6 intermediate against the real G3 root.
 */

// ---------------------------------------------------------------------------
// Pinned trust anchor
// ---------------------------------------------------------------------------

/**
 * Apple Root CA - G3, DER, base64.
 * Source: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 * SHA-256: 63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179
 * Valid 2014-04-30 to 2039-04-30. P-384 key, self-signed ecdsa-with-SHA384.
 * appleJws.test.ts recomputes the fingerprint from these bytes.
 */
export const APPLE_ROOT_CA_G3_B64 =
  'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==';

export const APPLE_ROOT_CA_G3_SHA256 =
  '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

export const OID_APPLE_LEAF_MARKER = '1.2.840.113635.100.6.11.1';
export const OID_APPLE_INTERMEDIATE_MARKER = '1.2.840.113635.100.6.2.1';
const OID_BASIC_CONSTRAINTS = '2.5.29.19';
const OID_EC_PUBLIC_KEY = '1.2.840.10045.2.1';

const SIG_HASH_BY_OID: Record<string, string> = {
  '1.2.840.10045.4.3.2': 'SHA-256', // ecdsa-with-SHA256
  '1.2.840.10045.4.3.3': 'SHA-384', // ecdsa-with-SHA384
  '1.2.840.10045.4.3.4': 'SHA-512', // ecdsa-with-SHA512
};

const CURVE_BY_OID: Record<string, { name: string; size: number }> = {
  '1.2.840.10045.3.1.7': { name: 'P-256', size: 32 },
  '1.3.132.0.34': { name: 'P-384', size: 48 },
  '1.3.132.0.35': { name: 'P-521', size: 66 },
};

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(b64url)) throw new Error('Invalid base64url');
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return base64ToBytes(b64 + pad);
}

/** A standalone ArrayBuffer for WebCrypto, which will not take a view over ArrayBufferLike. */
function ab(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Minimal DER reader
// ---------------------------------------------------------------------------

interface DerNode {
  tag: number;
  /** Offset of the tag byte. */
  start: number;
  contentStart: number;
  /** Offset one past the last content byte. */
  end: number;
}

function readNode(buf: Uint8Array, offset: number, limit: number): DerNode {
  if (offset + 2 > limit) throw new Error('DER: truncated header');
  const tag = buf[offset];
  if ((tag & 0x1f) === 0x1f) throw new Error('DER: multi-byte tags are not supported');
  let p = offset + 1;
  const first = buf[p++];
  let len: number;
  if (first < 0x80) {
    len = first;
  } else {
    const n = first & 0x7f;
    if (n === 0) throw new Error('DER: indefinite length is not DER');
    if (n > 4) throw new Error('DER: length too large');
    if (p + n > limit) throw new Error('DER: truncated length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
  }
  const end = p + len;
  if (end > limit) throw new Error('DER: length runs past its parent');
  return { tag, start: offset, contentStart: p, end };
}

function childrenOf(buf: Uint8Array, node: DerNode): DerNode[] {
  const out: DerNode[] = [];
  let p = node.contentStart;
  while (p < node.end) {
    const child = readNode(buf, p, node.end);
    out.push(child);
    p = child.end;
  }
  return out;
}

function expectTag(node: DerNode | undefined, tag: number, what: string): DerNode {
  if (!node || node.tag !== tag) {
    throw new Error(`DER: expected ${what} (tag 0x${tag.toString(16)})`);
  }
  return node;
}

const content = (buf: Uint8Array, n: DerNode) => buf.subarray(n.contentStart, n.end);
const whole = (buf: Uint8Array, n: DerNode) => buf.subarray(n.start, n.end);

function decodeOid(bytes: Uint8Array): string {
  if (bytes.length === 0) throw new Error('DER: empty OID');
  const parts: number[] = [];
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    value = value * 128 + (bytes[i] & 0x7f);
    if ((bytes[i] & 0x80) === 0) {
      if (parts.length === 0) {
        const a = value < 80 ? Math.floor(value / 40) : 2;
        parts.push(a, value - a * 40);
      } else {
        parts.push(value);
      }
      value = 0;
    } else if (i === bytes.length - 1) {
      throw new Error('DER: truncated OID');
    }
  }
  return parts.join('.');
}

function decodeTime(buf: Uint8Array, node: DerNode): number {
  const s = new TextDecoder().decode(content(buf, node));
  let m: RegExpMatchArray | null;
  let year: number;
  if (node.tag === 0x17) {
    m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
    if (!m) throw new Error('DER: bad UTCTime');
    const yy = Number(m[1]);
    year = yy < 50 ? 2000 + yy : 1900 + yy;
  } else if (node.tag === 0x18) {
    m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
    if (!m) throw new Error('DER: bad GeneralizedTime');
    year = Number(m[1]);
  } else {
    throw new Error('DER: expected a time');
  }
  return Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

// ---------------------------------------------------------------------------
// X.509
// ---------------------------------------------------------------------------

export interface ParsedCertificate {
  der: Uint8Array;
  tbs: Uint8Array;
  signatureAlgorithmOid: string;
  /** DER-encoded ECDSA-Sig-Value from the signatureValue BIT STRING. */
  signature: Uint8Array;
  issuer: Uint8Array;
  subject: Uint8Array;
  notBefore: number;
  notAfter: number;
  spki: Uint8Array;
  keyAlgorithmOid: string;
  curveOid: string | null;
  isCA: boolean;
  extensionOids: Set<string>;
}

export function parseCertificate(der: Uint8Array): ParsedCertificate {
  const cert = expectTag(readNode(der, 0, der.length), 0x30, 'Certificate');
  if (cert.end !== der.length) throw new Error('DER: trailing bytes after certificate');
  const [tbsNode, sigAlgNode, sigValNode, ...extra] = childrenOf(der, cert);
  if (extra.length) throw new Error('X.509: unexpected fields after signatureValue');
  expectTag(tbsNode, 0x30, 'TBSCertificate');
  expectTag(sigAlgNode, 0x30, 'signatureAlgorithm');
  expectTag(sigValNode, 0x03, 'signatureValue');

  const tbsFields = childrenOf(der, tbsNode);
  let i = 0;
  const version = expectTag(tbsFields[i++], 0xa0, 'version (v3 required)');
  const versionInt = expectTag(childrenOf(der, version)[0], 0x02, 'version INTEGER');
  const vBytes = content(der, versionInt);
  if (vBytes.length !== 1 || vBytes[0] !== 2) throw new Error('X.509: only v3 certificates are accepted');
  expectTag(tbsFields[i++], 0x02, 'serialNumber');
  const innerSigAlg = expectTag(tbsFields[i++], 0x30, 'signature');
  const issuer = expectTag(tbsFields[i++], 0x30, 'issuer');
  const validity = expectTag(tbsFields[i++], 0x30, 'validity');
  const subject = expectTag(tbsFields[i++], 0x30, 'subject');
  const spki = expectTag(tbsFields[i++], 0x30, 'subjectPublicKeyInfo');

  if (!bytesEqual(whole(der, innerSigAlg), whole(der, sigAlgNode))) {
    throw new Error('X.509: signature algorithm in TBSCertificate differs from the outer one');
  }
  const sigAlgOid = decodeOid(content(der, expectTag(childrenOf(der, sigAlgNode)[0], 0x06, 'algorithm OID')));

  const [nb, na] = childrenOf(der, validity);
  if (!nb || !na) throw new Error('X.509: validity needs notBefore and notAfter');
  const notBefore = decodeTime(der, nb);
  const notAfter = decodeTime(der, na);

  const spkiAlg = expectTag(childrenOf(der, spki)[0], 0x30, 'SPKI algorithm');
  const [keyAlgOidNode, curveNode] = childrenOf(der, spkiAlg);
  const keyAlgorithmOid = decodeOid(content(der, expectTag(keyAlgOidNode, 0x06, 'key algorithm OID')));
  const curveOid = curveNode && curveNode.tag === 0x06 ? decodeOid(content(der, curveNode)) : null;

  let isCA = false;
  const extensionOids = new Set<string>();
  for (; i < tbsFields.length; i++) {
    const f = tbsFields[i];
    if (f.tag === 0xa1 || f.tag === 0xa2) continue; // issuer/subject unique IDs
    if (f.tag !== 0xa3) throw new Error(`X.509: unexpected TBSCertificate field 0x${f.tag.toString(16)}`);
    const extSeq = expectTag(childrenOf(der, f)[0], 0x30, 'Extensions');
    for (const ext of childrenOf(der, extSeq)) {
      expectTag(ext, 0x30, 'Extension');
      const parts = childrenOf(der, ext);
      const oid = decodeOid(content(der, expectTag(parts[0], 0x06, 'extnID')));
      if (extensionOids.has(oid)) throw new Error(`X.509: duplicate extension ${oid}`);
      extensionOids.add(oid);
      const valueNode = expectTag(parts[parts.length - 1], 0x04, 'extnValue');
      if (oid === OID_BASIC_CONSTRAINTS) {
        const value = content(der, valueNode);
        const bc = expectTag(readNode(value, 0, value.length), 0x30, 'BasicConstraints');
        if (bc.end !== value.length) throw new Error('X.509: trailing bytes in BasicConstraints');
        const first = childrenOf(value, bc)[0];
        if (first && first.tag === 0x01) {
          const b = content(value, first);
          isCA = b.length === 1 && b[0] !== 0;
        }
      }
    }
  }

  const sigBits = content(der, sigValNode);
  if (sigBits.length < 2 || sigBits[0] !== 0) throw new Error('X.509: signatureValue must have 0 unused bits');

  return {
    der,
    tbs: whole(der, tbsNode),
    signatureAlgorithmOid: sigAlgOid,
    signature: sigBits.subarray(1),
    issuer: whole(der, issuer),
    subject: whole(der, subject),
    notBefore,
    notAfter,
    spki: whole(der, spki),
    keyAlgorithmOid,
    curveOid,
    isCA,
    extensionOids,
  };
}

/** ECDSA-Sig-Value (DER SEQUENCE of two INTEGERs) to the raw r||s WebCrypto verifies. */
export function derEcdsaSignatureToRaw(sig: Uint8Array, size: number): Uint8Array {
  const seq = expectTag(readNode(sig, 0, sig.length), 0x30, 'ECDSA-Sig-Value');
  if (seq.end !== sig.length) throw new Error('DER: trailing bytes after ECDSA signature');
  const ints = childrenOf(sig, seq);
  if (ints.length !== 2) throw new Error('DER: ECDSA signature needs exactly r and s');
  const out = new Uint8Array(size * 2);
  ints.forEach((n, k) => {
    let v = content(sig, expectTag(n, 0x02, 'INTEGER'));
    while (v.length > 1 && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new Error('DER: ECDSA integer too long for the curve');
    out.set(v, k * size + (size - v.length));
  });
  return out;
}

function curveOf(cert: ParsedCertificate): { name: string; size: number } {
  if (cert.keyAlgorithmOid !== OID_EC_PUBLIC_KEY) {
    throw new Error(`X.509: unsupported key algorithm ${cert.keyAlgorithmOid}`);
  }
  const curve = cert.curveOid ? CURVE_BY_OID[cert.curveOid] : undefined;
  if (!curve) throw new Error(`X.509: unsupported curve ${cert.curveOid}`);
  return curve;
}

async function importEcKey(cert: ParsedCertificate): Promise<CryptoKey> {
  const curve = curveOf(cert);
  return await crypto.subtle.importKey('spki', ab(cert.spki), { name: 'ECDSA', namedCurve: curve.name }, false, [
    'verify',
  ]);
}

/** True when `child` names `issuer` as its issuer and `issuer`'s key signed it. */
export async function verifyIssuedBy(child: ParsedCertificate, issuer: ParsedCertificate): Promise<boolean> {
  if (!bytesEqual(child.issuer, issuer.subject)) return false;
  const hash = SIG_HASH_BY_OID[child.signatureAlgorithmOid];
  if (!hash) throw new Error(`X.509: unsupported signature algorithm ${child.signatureAlgorithmOid}`);
  const raw = derEcdsaSignatureToRaw(child.signature, curveOf(issuer).size);
  const key = await importEcKey(issuer);
  return await crypto.subtle.verify({ name: 'ECDSA', hash }, key, ab(raw), ab(child.tbs));
}

// ---------------------------------------------------------------------------
// JWS
// ---------------------------------------------------------------------------

export interface VerifyAppleJwsOptions {
  /** DER of the trusted roots. Defaults to Apple Root CA - G3; tests inject their own. */
  trustedRoots?: readonly Uint8Array[];
  /** Overrides the date validity is judged at (default: payload signedDate, else now). */
  effectiveDate?: Date;
}

const DEFAULT_ROOTS: readonly Uint8Array[] = [base64ToBytes(APPLE_ROOT_CA_G3_B64)];

function checkValidity(cert: ParsedCertificate, at: number, label: string) {
  if (at < cert.notBefore) throw new Error(`${label} certificate is not yet valid`);
  if (at > cert.notAfter) throw new Error(`${label} certificate has expired`);
}

/**
 * Verify an App Store-signed JWS and return its payload. Throws on any
 * failure; the message names the check that failed and never echoes input.
 */
export async function verifyAppleJWS<T>(jws: string, opts: VerifyAppleJwsOptions = {}): Promise<T> {
  if (typeof jws !== 'string') throw new Error('JWS must be a string');
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS format');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedHeader)));
  if (!header || typeof header !== 'object') throw new Error('Invalid JWS header');
  if (header.alg !== 'ES256') throw new Error(`Unsupported JWS algorithm: ${String(header.alg)}`);
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length !== 3 || !x5c.every((c: unknown) => typeof c === 'string')) {
    throw new Error('JWS x5c must hold exactly [leaf, intermediate, root]');
  }

  const payloadBytes = base64UrlToBytes(encodedPayload);
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes));

  const [leafDer, intermediateDer, rootDer] = x5c.map((c: string) => base64ToBytes(c));
  const roots = opts.trustedRoots ?? DEFAULT_ROOTS;
  const pinned = roots.find((r) => bytesEqual(r, rootDer));
  if (!pinned) throw new Error('JWS x5c root is not a trusted root');

  const root = parseCertificate(pinned);
  const intermediate = parseCertificate(intermediateDer);
  const leaf = parseCertificate(leafDer);

  const signedDate = payload && typeof payload === 'object' ? (payload as { signedDate?: unknown }).signedDate : undefined;
  const at = opts.effectiveDate
    ? opts.effectiveDate.getTime()
    : typeof signedDate === 'number' && Number.isFinite(signedDate)
      ? signedDate
      : Date.now();

  checkValidity(root, at, 'Root');
  checkValidity(intermediate, at, 'Intermediate');
  checkValidity(leaf, at, 'Leaf');

  if (!intermediate.isCA) throw new Error('Intermediate certificate is not a CA');
  if (!intermediate.extensionOids.has(OID_APPLE_INTERMEDIATE_MARKER)) {
    throw new Error('Intermediate certificate lacks the Apple WWDR marker OID');
  }
  if (!leaf.extensionOids.has(OID_APPLE_LEAF_MARKER)) {
    throw new Error('Leaf certificate lacks the Apple receipt-signing marker OID');
  }

  if (!(await verifyIssuedBy(intermediate, root))) {
    throw new Error('Intermediate certificate is not signed by the trusted root');
  }
  if (!(await verifyIssuedBy(leaf, intermediate))) {
    throw new Error('Leaf certificate is not signed by the intermediate');
  }

  if (curveOf(leaf).name !== 'P-256') throw new Error('ES256 needs a P-256 leaf key');
  const signature = base64UrlToBytes(encodedSignature);
  if (signature.length !== 64) throw new Error('ES256 signature must be 64 bytes');
  const leafKey = await importEcKey(leaf);
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    leafKey,
    ab(signature),
    ab(new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)),
  );
  if (!ok) throw new Error('JWS signature verification failed');

  return payload as T;
}
