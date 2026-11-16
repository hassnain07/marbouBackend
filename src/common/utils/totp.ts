import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP (time-based one-time password) + HOTP helpers.
 * - Algorithm: HMAC-SHA-1, 6 digits, 30-second step.
 * - Verification window: ±1 step (current, previous, next) per AUTH-20.
 * - Replay protection: track the highest accepted counter step; reject any step
 *   ≤ the last accepted step.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;

/** Generate a random TOTP secret (base32). 20 bytes = 160 bits, the RFC default. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Compute the TOTP value for a given counter step (time / 30s).
 * Uses HMAC-SHA-1 (RFC 6238 default). Returns a zero-padded 6-digit string.
 */
export function hotp(secretBase32: string, counter: bigint): string {
  const key = base32Decode(secretBase32);
  const counterBuf = Buffer.alloc(8);
  // Write the 64-bit big-endian counter (BigInt).
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBuf[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  const otp = bin % 10 ** DIGITS;
  return otp.toString().padStart(DIGITS, '0');
}

/** Current time counter (BigInt seconds / 30). */
export function currentTotpStep(now: Date = new Date()): bigint {
  return BigInt(Math.floor(now.getTime() / 1000 / STEP_SECONDS));
}

/** TOTP step → the wall-clock time it represents (for expiry display). */
export function totpStepTime(step: bigint): Date {
  return new Date(Number(step) * STEP_SECONDS * 1000);
}

/**
 * Verify a TOTP code within a ±1 step window. Returns the accepted step (BigInt)
 * if valid (and not below the replay floor), or null if invalid/replayed.
 *
 * @param secretBase32 the base32 secret
 * @param code 6-digit code submitted by the user
 * @param lastAcceptedStep highest step already accepted (replay floor); null = none
 * @param now current time (injectable for tests)
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  lastAcceptedStep: bigint | null,
  now: Date = new Date(),
): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = currentTotpStep(now);
  const steps = [current - 1n, current, current + 1n];
  for (const step of steps) {
    const candidate = hotp(secretBase32, step);
    if (timingSafeEqualFixedTime(candidate, code)) {
      // Replay protection: reject any step ≤ the last accepted step.
      if (lastAcceptedStep !== null && step <= lastAcceptedStep) {
        return null;
      }
      return step;
    }
  }
  return null;
}

/** Constant-time string comparison (both must be 6 chars). */
function timingSafeEqualFixedTime(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Build an otpauth:// URI for QR generation. */
export function buildOtpauthUri(
  secretBase32: string,
  email: string,
  issuer = 'MARBOU',
): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

// ── base32 (RFC 4648, no padding) ─────────────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
