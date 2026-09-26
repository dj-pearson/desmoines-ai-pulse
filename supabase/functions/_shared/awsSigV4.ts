/**
 * AWS Signature Version 4 request signing, on crypto.subtle only.
 *
 * Written for the SES v2 API (WP2 of docs/plans/NON_CORE_REVIEW_2026-09.md),
 * general enough for any AWS JSON API that signs headers rather than the query
 * string. No imports, so it loads in a Deno test with no network; the test
 * reproduces signatures from the AWS aws-sig-v4-test-suite byte for byte.
 *
 * Reference: https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
 */

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** Only for temporary credentials. Signed as x-amz-security-token. */
  sessionToken?: string;
}

export interface SigV4Request {
  method: string;
  url: string;
  /** Headers to send. Every header here is signed. Host is added from the URL. */
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

export interface SigV4Options {
  region: string;
  service: string;
  credentials: SigV4Credentials;
  /** Signing time. Defaults to now; the tests pin it. */
  now?: Date;
}

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A standalone ArrayBuffer copy, which every crypto.subtle overload accepts. */
function bytes(input: string | Uint8Array | ArrayBuffer | undefined): ArrayBuffer {
  if (input === undefined) return new ArrayBuffer(0);
  if (input instanceof ArrayBuffer) return input;
  const u = typeof input === "string" ? encoder.encode(input) : input;
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

export async function sha256Hex(input: string | Uint8Array | undefined): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", bytes(input)));
}

async function hmac(key: Uint8Array | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", bytes(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, bytes(data));
}

/** RFC 3986 unreserved characters pass; everything else is %XX, uppercase. */
export function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** 20150830T123600Z */
export function amzDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function canonicalPath(pathname: string): string {
  if (!pathname) return "/";
  // URL.pathname is already percent-encoded; decode each segment and re-encode
  // it the AWS way so "a b", "a%20b" and "a+b" all sign the same as they send.
  return pathname
    .split("/")
    .map((seg) => {
      try {
        return uriEncode(decodeURIComponent(seg));
      } catch {
        return uriEncode(seg);
      }
    })
    .join("/");
}

function canonicalQuery(search: URLSearchParams): string {
  const pairs: Array<[string, string]> = [];
  search.forEach((v, k) => pairs.push([uriEncode(k), uriEncode(v)]));
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

function normalizeHeaderValue(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

export interface CanonicalParts {
  canonicalRequest: string;
  signedHeaders: string;
  /** Lowercase header map that must go out with the request (includes host, x-amz-date). */
  headers: Record<string, string>;
}

export async function buildCanonicalRequest(req: SigV4Request, xAmzDate: string, sessionToken?: string): Promise<CanonicalParts> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) headers[k.toLowerCase()] = v;
  headers["host"] = headers["host"] ?? url.host;
  headers["x-amz-date"] = xAmzDate;
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${normalizeHeaderValue(headers[n])}\n`).join("");
  const signedHeaders = names.join(";");
  const payloadHash = await sha256Hex(req.body);

  const canonicalRequest = [
    req.method.toUpperCase(),
    canonicalPath(url.pathname),
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  return { canonicalRequest, signedHeaders, headers };
}

export function credentialScope(xAmzDate: string, region: string, service: string): string {
  return `${xAmzDate.slice(0, 8)}/${region}/${service}/aws4_request`;
}

export async function buildStringToSign(canonicalRequest: string, xAmzDate: string, scope: string): Promise<string> {
  return ["AWS4-HMAC-SHA256", xAmzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
}

export async function deriveSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/**
 * Sign a request. Returns the full header set to send: the caller's headers
 * lowercased, plus host, x-amz-date, x-amz-security-token when present, and
 * authorization. The body must be sent exactly as passed here.
 */
export async function signRequest(req: SigV4Request, opts: SigV4Options): Promise<Record<string, string>> {
  const xAmzDate = amzDate(opts.now ?? new Date());
  const { canonicalRequest, signedHeaders, headers } = await buildCanonicalRequest(req, xAmzDate, opts.credentials.sessionToken);
  const scope = credentialScope(xAmzDate, opts.region, opts.service);
  const stringToSign = await buildStringToSign(canonicalRequest, xAmzDate, scope);
  const key = await deriveSigningKey(opts.credentials.secretAccessKey, xAmzDate.slice(0, 8), opts.region, opts.service);
  const signature = toHex(await hmac(key, stringToSign));
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${opts.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
