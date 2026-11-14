import { createHash } from 'node:crypto';

/** SHA-256 hex digest of a UTF-8 string. */
export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Deterministic canonical JSON — recursively sorts object keys so the same
 * logical value always produces the same string. Used for the tamper-evident
 * audit hash chain: `hash = SHA256(prevHash + canonicalJson(entry))`. Handles
 * Date (→ ISO string), BigInt (→ string) and drops `undefined` fields, matching
 * JSON.stringify semantics but with sorted keys.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortForCanonical(value));
}

function sortForCanonical(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortForCanonical);
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue; // match JSON.stringify: drop undefined
      sorted[key] = sortForCanonical(v);
    }
    return sorted;
  }
  return value;
}
