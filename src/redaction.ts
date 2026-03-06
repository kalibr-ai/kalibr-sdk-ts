/**
 * PII redaction and hashing utilities.
 *
 * Detects common PII patterns (emails, phone numbers, SSNs, credit cards,
 * IPv4 addresses) and replaces them with placeholder tokens. Provides
 * SHA-256 hashing that works in both Node.js and browser environments.
 */

// ---------------------------------------------------------------------------
// PII patterns
// ---------------------------------------------------------------------------

const PII_PATTERNS: [RegExp, string][] = [
  // Email addresses
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]'],
  // SSNs (###-##-####) — must come before phone to avoid partial matches
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'],
  // US phone numbers (###-###-#### or ###.###.####)
  [/\b\d{3}[-.]\d{3}[-.]\d{4}\b/g, '[PHONE]'],
  // Credit card numbers (16 digits with optional spaces or dashes)
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CREDIT_CARD]'],
  // IPv4 addresses
  [/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, '[IP_ADDRESS]'],
];

// ---------------------------------------------------------------------------
// redactText
// ---------------------------------------------------------------------------

/**
 * Replace PII matches in `text` with placeholder tokens.
 *
 * @example
 * ```ts
 * redactText('email me at bob@example.com');
 * // => 'email me at [EMAIL]'
 * ```
 */
export function redactText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PII_PATTERNS) {
    // Reset lastIndex since we reuse the same RegExp objects.
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ---------------------------------------------------------------------------
// hashText
// ---------------------------------------------------------------------------

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    parts.push((bytes[i] as number).toString(16).padStart(2, '0'));
  }
  return parts.join('');
}

/**
 * Return the SHA-256 hex digest of `text`.
 *
 * Uses the Web Crypto API (`crypto.subtle.digest`) when available, with a
 * synchronous fallback to Node.js `crypto.createHash`.
 */
export async function hashText(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);

  // Prefer Web Crypto API (works in browsers and modern Node.js)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return toHex(digest);
  }

  // Fallback: Node.js built-in crypto
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // Dynamic import via Function to avoid bundler/TS module resolution issues
  const nodeCrypto = await (Function('return import("crypt" + "o")')() as Promise<{ createHash: (alg: string) => { update: (d: string) => { digest: (e: string) => string } } }>);
  return nodeCrypto.createHash('sha256').update(text).digest('hex');
}

// ---------------------------------------------------------------------------
// redactAndHash
// ---------------------------------------------------------------------------

const ZERO_HASH = '0'.repeat(64);

/**
 * Redact PII from `text` and return its SHA-256 hex hash.
 *
 * Returns a string of 64 zeros for `null`, `undefined`, or empty-string input.
 */
export async function redactAndHash(text: string | null | undefined): Promise<string> {
  if (text == null || text === '') {
    return ZERO_HASH;
  }
  const redacted = redactText(text);
  return hashText(redacted);
}
