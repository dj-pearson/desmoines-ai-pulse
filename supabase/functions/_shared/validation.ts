/**
 * Input validation utilities for edge functions
 */

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'email' | 'url';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  default?: any;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export interface ValidationResult {
  success: boolean;
  data?: Record<string, any>;
  errors?: Record<string, string>;
}

/**
 * Validate input against a schema
 */
export function validateInput(
  input: Record<string, any>,
  schema: ValidationSchema
): ValidationResult {
  const errors: Record<string, string> = {};
  const data: Record<string, any> = {};

  for (const [key, rule] of Object.entries(schema)) {
    const value = input[key];

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors[key] = `${key} is required`;
      continue;
    }

    // Use default if not provided and not required
    if (value === undefined || value === null || value === '') {
      if (rule.default !== undefined) {
        data[key] = rule.default;
      }
      continue;
    }

    // Type validation
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors[key] = `${key} must be a string`;
          break;
        }
        if (rule.min !== undefined && value.length < rule.min) {
          errors[key] = `${key} must be at least ${rule.min} characters`;
          break;
        }
        if (rule.max !== undefined && value.length > rule.max) {
          errors[key] = `${key} must be at most ${rule.max} characters`;
          break;
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          errors[key] = `${key} has invalid format`;
          break;
        }
        data[key] = value;
        break;

      case 'number':
        const num = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(num)) {
          errors[key] = `${key} must be a number`;
          break;
        }
        if (rule.min !== undefined && num < rule.min) {
          errors[key] = `${key} must be at least ${rule.min}`;
          break;
        }
        if (rule.max !== undefined && num > rule.max) {
          errors[key] = `${key} must be at most ${rule.max}`;
          break;
        }
        data[key] = num;
        break;

      case 'boolean':
        if (typeof value === 'string') {
          data[key] = value === 'true' || value === '1';
        } else {
          data[key] = Boolean(value);
        }
        break;

      case 'email':
        if (typeof value !== 'string') {
          errors[key] = `${key} must be a string`;
          break;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors[key] = `${key} must be a valid email`;
          break;
        }
        if (value.length > 254) {
          errors[key] = `${key} is too long`;
          break;
        }
        data[key] = value;
        break;

      case 'url':
        if (typeof value !== 'string') {
          errors[key] = `${key} must be a string`;
          break;
        }
        try {
          new URL(value);
          data[key] = value;
        } catch {
          errors[key] = `${key} must be a valid URL`;
        }
        break;

      default:
        data[key] = value;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return { success: true, data };
}

/**
 * Sanitize string input to prevent SQL injection.
 * Removes dangerous SQL characters. For LIKE queries, use sanitizeLikeInput instead.
 */
export function sanitizeString(input: string, maxLength = 500): string {
  return input
    .slice(0, maxLength)
    .replace(/[';\\]/g, '') // Remove quotes and backslashes
    .trim();
}

/**
 * Sanitize string input specifically for use in SQL LIKE/ILIKE patterns.
 * Escapes LIKE wildcard characters (%, _) and backslash to prevent
 * pattern manipulation attacks (e.g., searching '%' to match all rows).
 */
export function sanitizeLikeInput(input: string, maxLength = 500): string {
  return input
    .slice(0, maxLength)
    .replace(/\\/g, '\\\\')  // Escape backslash first
    .replace(/%/g, '\\%')    // Escape LIKE wildcard %
    .replace(/_/g, '\\_')    // Escape LIKE wildcard _
    .replace(/[';]/g, '')    // Remove quotes
    .trim();
}

/**
 * Sanitize a value that will be interpolated into a PostgREST filter string
 * (e.g. supabase `.or("col.ilike.%VALUE%,...")` or `.ilike("col", "%VALUE%")`).
 *
 * PostgREST parses commas, parentheses, asterisks and backticks structurally,
 * so a raw user value containing those characters can rewrite the filter and
 * exfiltrate columns. This strips those metacharacters and also escapes the
 * LIKE wildcards via sanitizeLikeInput.
 */
export function sanitizePostgrestPattern(input: string, maxLength = 200): string {
  return sanitizeLikeInput(input, maxLength)
    .replace(/[,()*`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate query parameters from URL
 */
export function validateQueryParams(
  url: URL,
  schema: ValidationSchema
): ValidationResult {
  const params: Record<string, any> = {};

  for (const [key] of Object.entries(schema)) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      params[key] = value;
    }
  }

  return validateInput(params, schema);
}

/**
 * SSRF Protection: Validate URL to prevent Server-Side Request Forgery attacks
 * Blocks private IP ranges, localhost, and non-HTTP protocols
 */
export interface SSRFValidationOptions {
  allowedDomains?: string[];
  allowedProtocols?: string[];
  blockPrivateIPs?: boolean;
}

export interface SSRFValidationResult {
  valid: boolean;
  error?: string;
  url?: URL;
}

/**
 * Parse a single inet_aton component (decimal, 0x-hex, or 0-octal) to a number.
 * Returns null if the token is not a valid numeric component.
 */
function parseIPComponent(token: string): number | null {
  if (token === '') return null;
  let n: number;
  if (/^0x[0-9a-f]+$/i.test(token)) n = parseInt(token, 16);
  else if (/^0[0-7]+$/.test(token)) n = parseInt(token, 8);
  else if (/^[0-9]+$/.test(token)) n = parseInt(token, 10);
  else return null;
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize any inet_aton-accepted IPv4 form to four octets.
 * Handles dotted-quad, decimal (2130706433), hex (0x7f000001), octal (0177.0.0.1),
 * and the short a.b / a.b.c forms (127.1 → 127.0.0.1). Returns null if not IPv4.
 */
function inetAtonToOctets(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const n = parseIPComponent(p);
    if (n === null) return null;
    nums.push(n);
  }
  let value: number;
  switch (nums.length) {
    case 1:
      value = nums[0];
      break;
    case 2:
      if (nums[0] > 0xff || nums[1] > 0xffffff) return null;
      value = nums[0] * 0x1000000 + nums[1];
      break;
    case 3:
      if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null;
      value = nums[0] * 0x1000000 + nums[1] * 0x10000 + nums[2];
      break;
    default: // 4
      if (nums.some((n) => n > 0xff)) return null;
      value = nums[0] * 0x1000000 + nums[1] * 0x10000 + nums[2] * 0x100 + nums[3];
  }
  if (value < 0 || value > 0xffffffff) return null;
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

/** True if four octets fall in a loopback/private/link-local/reserved range. */
function areOctetsPrivate([a, b]: number[]): boolean {
  if (a === 0) return true; // 0.0.0.0/8 ("this host")
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255
  return false;
}

/** Expand an IPv6 literal (incl. embedded IPv4) to eight 16-bit groups, or null. */
function expandIPv6(input: string): number[] | null {
  let h = input.toLowerCase().replace(/%.*$/, ''); // strip zone id
  // Fold a trailing embedded IPv4 (e.g. ::ffff:127.0.0.1) into two hex groups.
  const lastColon = h.lastIndexOf(':');
  if (h.includes('.') && lastColon !== -1) {
    const v4 = inetAtonToOctets(h.slice(lastColon + 1));
    if (!v4) return null;
    const g6 = ((v4[0] << 8) | v4[1]).toString(16);
    const g7 = ((v4[2] << 8) | v4[3]).toString(16);
    h = h.slice(0, lastColon + 1) + g6 + ':' + g7;
  }
  const halves = h.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

/** True if an expanded IPv6 address is loopback/unspecified/link-local/ULA/mapped-private. */
function isPrivateIPv6(groups: number[]): boolean {
  const allZeroButLast = groups.slice(0, 7).every((g) => g === 0);
  if (allZeroButLast && groups[7] === 1) return true; // ::1 loopback
  if (groups.every((g) => g === 0)) return true; // :: unspecified
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local (incl. fd00:ec2::254 metadata)
  if ((groups[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  // IPv4-mapped (::ffff:a.b.c.d) / IPv4-compatible — re-check the embedded v4.
  if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    return areOctetsPrivate([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
  }
  return false;
}

/**
 * Check if a hostname is (or resolves in-string to) a private/internal address.
 * Rejects encoded IPv4 (decimal/hex/octal/short forms), IPv6 incl. IPv4-mapped
 * and cloud-metadata addresses, plus internal-looking hostnames. This is a
 * literal-form guard; callers that must defeat DNS rebinding should additionally
 * enforce a host allowlist or resolve via {@link resolvesToPrivateAddress}.
 */
export function isPrivateIP(hostname: string): boolean {
  // Normalize brackets/zone id from URL.hostname (IPv6 comes bracketless from URL, but be safe).
  const host = hostname.replace(/^\[|\]$/g, '').replace(/%.*$/, '').toLowerCase();

  if (host === 'localhost' || host === '' ) return true;

  const octets = inetAtonToOctets(host);
  if (octets) return areOctetsPrivate(octets);

  if (host.includes(':')) {
    const groups = expandIPv6(host);
    if (groups) return isPrivateIPv6(groups);
    // Unparseable IPv6-looking literal — treat as unsafe rather than fetchable.
    return true;
  }

  // Internal-looking hostnames (defense in depth; not a substitute for DNS resolution).
  const privatePatterns = [/^localhost$/i, /\.local$/i, /\.internal$/i, /\.localhost$/i];
  return privatePatterns.some((pattern) => pattern.test(host));
}

/**
 * Resolve a hostname and return true if any resolved address is private/internal.
 * Defeats DNS-rebinding hostnames that point at internal IPs. Fails CLOSED
 * (returns true) if resolution errors, so a resolver outage can't open the guard.
 * Skips resolution for literal IPs (already covered by {@link isPrivateIP}).
 */
export async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  // Literal IPs don't need DNS; isPrivateIP already classified them.
  if (inetAtonToOctets(host) || host.includes(':')) return isPrivateIP(host);
  // Deno.resolveDns is available in the edge runtime; guard for other runtimes.
  const resolver = (globalThis as { Deno?: { resolveDns?: (h: string, t: string) => Promise<string[]> } }).Deno;
  if (!resolver?.resolveDns) return false; // no resolver → rely on caller allowlist
  try {
    const [a, aaaa] = await Promise.allSettled([
      resolver.resolveDns(host, 'A'),
      resolver.resolveDns(host, 'AAAA'),
    ]);
    const ips: string[] = [];
    if (a.status === 'fulfilled') ips.push(...a.value);
    if (aaaa.status === 'fulfilled') ips.push(...aaaa.value);
    if (ips.length === 0) return true; // resolves to nothing usable → treat as unsafe
    return ips.some((ip) => isPrivateIP(ip));
  } catch {
    return true; // fail closed on resolver error
  }
}

/**
 * Validate a URL for SSRF vulnerabilities
 */
export function validateURLForSSRF(
  urlString: string,
  options: SSRFValidationOptions = {}
): SSRFValidationResult {
  const {
    allowedDomains = [],
    allowedProtocols = ['http:', 'https:'],
    blockPrivateIPs = true,
  } = options;

  // Parse URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Check protocol
  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    return {
      valid: false,
      error: `Protocol not allowed. Only ${allowedProtocols.join(', ')} are permitted`,
    };
  }

  // Check for private/internal IPs
  if (blockPrivateIPs && isPrivateIP(parsedUrl.hostname)) {
    return {
      valid: false,
      error: 'Access to private/internal addresses is not allowed',
    };
  }

  // Check allowed domains if specified
  if (allowedDomains.length > 0) {
    const isAllowed = allowedDomains.some(domain => {
      // Exact match or subdomain match
      return parsedUrl.hostname === domain ||
             parsedUrl.hostname.endsWith('.' + domain);
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: `Domain not allowed. Permitted domains: ${allowedDomains.join(', ')}`,
      };
    }
  }

  // Block URLs with credentials
  if (parsedUrl.username || parsedUrl.password) {
    return {
      valid: false,
      error: 'URLs with embedded credentials are not allowed',
    };
  }

  return { valid: true, url: parsedUrl };
}

/**
 * SSRF validation that additionally resolves the hostname and blocks it if any
 * resolved address is private/internal (DNS-rebinding defense). Use for guards
 * that fetch arbitrary caller-supplied URLs without a host allowlist (e.g.
 * seo-audit). Fails closed on resolution errors.
 */
export async function validateURLForSSRFResolved(
  urlString: string,
  options: SSRFValidationOptions = {},
): Promise<SSRFValidationResult> {
  const base = validateURLForSSRF(urlString, options);
  if (!base.valid || !base.url) return base;
  // Only resolve when private IPs are being blocked and no allowlist already gates the host.
  const blockPrivate = options.blockPrivateIPs ?? true;
  const hasAllowlist = (options.allowedDomains?.length ?? 0) > 0;
  if (blockPrivate && !hasAllowlist && (await resolvesToPrivateAddress(base.url.hostname))) {
    return { valid: false, error: 'Host resolves to a private/internal address' };
  }
  return base;
}
