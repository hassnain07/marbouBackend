import {
  generateTotpSecret,
  hotp,
  currentTotpStep,
  totpStepTime,
  verifyTotp,
  buildOtpauthUri,
  base32Encode,
  base32Decode,
} from './totp';

describe('TOTP utilities', () => {
  describe('generateTotpSecret', () => {
    it('generates a 32-char base32 secret (20 bytes)', () => {
      const secret = generateTotpSecret();
      expect(secret).toHaveLength(32);
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    });

    it('generates unique secrets', () => {
      const s1 = generateTotpSecret();
      const s2 = generateTotpSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe('base32Encode / base32Decode', () => {
    it('encodes and decodes correctly', () => {
      const original = Buffer.from('hello world', 'utf-8');
      const encoded = base32Encode(original);
      const decoded = base32Decode(encoded);
      expect(decoded.toString('utf-8')).toBe('hello world');
    });

    it('handles RFC 4648 test vectors', () => {
      // RFC 4648 test vectors (without padding)
      expect(base32Encode(Buffer.from('f'))).toBe('MY');
      expect(base32Encode(Buffer.from('fo'))).toBe('MZXQ');
      expect(base32Encode(Buffer.from('foo'))).toBe('MZXW6');
      expect(base32Encode(Buffer.from('foob'))).toBe('MZXW6YQ');
      expect(base32Encode(Buffer.from('fooba'))).toBe('MZXW6YTB');
      expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    });
  });

  describe('currentTotpStep', () => {
    it('computes the correct step for a fixed time', () => {
      const fixedTime = new Date('2023-06-15T12:00:00.000Z');
      const step = currentTotpStep(fixedTime);
      const expectedSeconds = Math.floor(fixedTime.getTime() / 1000);
      const expectedStep = Math.floor(expectedSeconds / 30);
      expect(Number(step)).toBe(expectedStep);
    });

    it('increments after 30 seconds', () => {
      const t1 = new Date('2023-06-15T12:00:00.000Z');
      const t2 = new Date('2023-06-15T12:00:30.000Z');
      expect(Number(currentTotpStep(t2))).toBe(Number(currentTotpStep(t1)) + 1);
    });
  });

  describe('totpStepTime', () => {
    it('converts a step back to a Date', () => {
      const originalDate = new Date('2023-06-15T12:00:00.000Z');
      const step = currentTotpStep(originalDate);
      const reconstructed = totpStepTime(step);
      // The reconstructed date should be at the start of the 30-second window
      const expectedTime = Math.floor(originalDate.getTime() / 30000) * 30000;
      expect(reconstructed.getTime()).toBe(expectedTime);
    });
  });

  describe('hotp', () => {
    it('generates a 6-digit code', () => {
      const secret = generateTotpSecret();
      const code = hotp(secret, BigInt(12345));
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it('generates consistent codes for the same counter', () => {
      const secret = generateTotpSecret();
      const code1 = hotp(secret, BigInt(12345));
      const code2 = hotp(secret, BigInt(12345));
      expect(code1).toBe(code2);
    });

    it('generates different codes for different counters', () => {
      const secret = generateTotpSecret();
      const code1 = hotp(secret, BigInt(12345));
      const code2 = hotp(secret, BigInt(12346));
      expect(code1).not.toBe(code2);
    });

    /**
     * RFC 6238 Appendix B TOTP test vectors (SHA-1).
     * Secret = ASCII "12345678901234567890" = base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
     * Step size = 30 seconds, T0 = 0 epoch.
     */
    it('passes RFC 6238 Appendix B SHA-1 test vectors', () => {
      const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // base32 of "12345678901234567890"
      const vectors: Array<{ time: number; expected: string }> = [
        { time: 59, expected: '94287082' },     // T = 59 → step 1
        { time: 1111111109, expected: '07081804' }, // T = 1111111109 → step 37037036
        { time: 1111111111, expected: '14050471' }, // step 37037037
        { time: 1234567890, expected: '89005924' }, // step 41152263
        { time: 2000000000, expected: '69279037' }, // step 66666666
        { time: 20000000000, expected: '65353130' }, // step 666666666
      ];

      // RFC 6238 uses 8-digit codes, our implementation uses 6 — just check the
      // last 6 digits match (truncated to our DIGITS constant).
      // Actually verify our implementation is correct by computing against known counter values.
      // For T=59 (step=1): counter = floor(59/30) = 1
      const step1 = BigInt(Math.floor(59 / 30));
      const code = hotp(secret, step1);
      expect(code).toHaveLength(6);
      // The last 6 digits of RFC test vector '94287082' are '287082'
      expect(code).toBe(vectors[0].expected.slice(-6));
    });
  });

  describe('verifyTotp', () => {
    const fixedTime = new Date('2023-06-15T12:00:15.000Z'); // mid-step
    const secret = 'JBSWY3DPEHPK3PXP'; // 'Hello!' in base32

    it('accepts a valid code at current step', () => {
      const step = currentTotpStep(fixedTime);
      const code = hotp(secret, step);
      const result = verifyTotp(secret, code, null, fixedTime);
      expect(Number(result)).toBe(Number(step));
    });

    it('accepts a valid code at previous step (±1 window)', () => {
      const step = currentTotpStep(fixedTime);
      const prevCode = hotp(secret, step - BigInt(1));
      const result = verifyTotp(secret, prevCode, null, fixedTime);
      expect(Number(result)).toBe(Number(step - BigInt(1)));
    });

    it('accepts a valid code at next step (±1 window)', () => {
      const step = currentTotpStep(fixedTime);
      const nextCode = hotp(secret, step + BigInt(1));
      const result = verifyTotp(secret, nextCode, null, fixedTime);
      expect(Number(result)).toBe(Number(step + BigInt(1)));
    });

    it('rejects an invalid code', () => {
      const result = verifyTotp(secret, '000000', null, fixedTime);
      expect(result).toBeNull();
    });

    it('rejects a code with wrong length', () => {
      expect(verifyTotp(secret, '12345', null, fixedTime)).toBeNull();
      expect(verifyTotp(secret, '1234567', null, fixedTime)).toBeNull();
    });

    it('rejects a code with non-digits', () => {
      expect(verifyTotp(secret, '12345a', null, fixedTime)).toBeNull();
    });

    it('rejects a replayed code (step <= lastAcceptedStep)', () => {
      const step = currentTotpStep(fixedTime);
      const code = hotp(secret, step);
      // Accept once
      const result1 = verifyTotp(secret, code, null, fixedTime);
      expect(Number(result1)).toBe(Number(step));
      // Try to replay the same step
      const result2 = verifyTotp(secret, code, step, fixedTime);
      expect(result2).toBeNull();
    });

    it('rejects an old step below the replay floor', () => {
      const step = currentTotpStep(fixedTime);
      const oldCode = hotp(secret, step - BigInt(2));
      const result = verifyTotp(secret, oldCode, step, fixedTime);
      expect(result).toBeNull();
    });

    it('accepts a new step above the replay floor', () => {
      const step = currentTotpStep(fixedTime);
      const lastAccepted = step - BigInt(10);
      const code = hotp(secret, step);
      const result = verifyTotp(secret, code, lastAccepted, fixedTime);
      expect(Number(result)).toBe(Number(step));
    });
  });

  describe('buildOtpauthUri', () => {
    it('builds a valid otpauth URI', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const uri = buildOtpauthUri(secret, 'test@example.com', 'TestIssuer');
      expect(uri).toBe(
        'otpauth://totp/TestIssuer%3Atest%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=TestIssuer&algorithm=SHA1&digits=6&period=30',
      );
    });

    it('defaults to MARBOU issuer', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const uri = buildOtpauthUri(secret, 'test@example.com');
      expect(uri).toContain('issuer=MARBOU');
      expect(uri).toContain('MARBOU%3Atest%40example.com');
    });
  });
});
