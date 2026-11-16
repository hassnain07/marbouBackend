import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { configuration } from '../../config/configuration';

/**
 * AES-256-GCM authenticated encryption for secrets at rest (NFR-SEC-07, ADM-18).
 * The 32-byte key comes from ADMIN_TOTP_ENC_KEY (trimmed). We store
 * base64(iv[12] || tag[16] || ciphertext) — a single opaque string.
 *
 * Tamper detection is built-in: GCM's auth tag makes any ciphertext modification
 * fail on decrypt with a thrown error.
 */

function key32(): Buffer {
  const raw = configuration.ADMIN_TOTP_ENC_KEY;
  // Pad/truncate to exactly 32 bytes. The env schema enforces min 32 chars, so
  // this is belt-and-braces.
  const b = Buffer.from(raw, 'utf8');
  if (b.length >= 32) return b.subarray(0, 32);
  const out = Buffer.alloc(32);
  b.copy(out);
  return out;
}

/** Encrypt a UTF-8 plaintext → base64(iv|tag|ciphertext). */
export function aesEncrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key32(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt a base64(iv|tag|ciphertext) → UTF-8 plaintext. Throws on tamper. */
export function aesDecrypt(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key32(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}
