import { aesEncrypt, aesDecrypt } from './aes';

describe('AES-256-GCM encryption', () => {
  describe('aesEncrypt / aesDecrypt', () => {
    it('encrypts and decrypts correctly', () => {
      const plaintext = 'Hello, TOTP secret!';
      const encrypted = aesEncrypt(plaintext);
      const decrypted = aesDecrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext each time (random IV)', () => {
      const plaintext = 'same plaintext';
      const enc1 = aesEncrypt(plaintext);
      const enc2 = aesEncrypt(plaintext);
      expect(enc1).not.toBe(enc2);
      expect(aesDecrypt(enc1)).toBe(plaintext);
      expect(aesDecrypt(enc2)).toBe(plaintext);
    });

    it('handles empty string', () => {
      const encrypted = aesEncrypt('');
      expect(aesDecrypt(encrypted)).toBe('');
    });

    it('handles multi-byte UTF-8 characters', () => {
      const plaintext = '你好世界 🔐 émojis';
      const encrypted = aesEncrypt(plaintext);
      expect(aesDecrypt(encrypted)).toBe(plaintext);
    });

    it('throws on tampered ciphertext (modified tag)', () => {
      const encrypted = aesEncrypt('secret');
      const buf = Buffer.from(encrypted, 'base64');
      // Flip a bit in the auth tag (bytes 12-27)
      buf[12] ^= 0x01;
      const tampered = buf.toString('base64');
      expect(() => aesDecrypt(tampered)).toThrow();
    });

    it('throws on tampered ciphertext (modified data)', () => {
      const encrypted = aesEncrypt('secret');
      const buf = Buffer.from(encrypted, 'base64');
      // Flip a bit in the ciphertext (bytes 28+)
      if (buf.length > 28) {
        buf[28] ^= 0x01;
      }
      const tampered = buf.toString('base64');
      expect(() => aesDecrypt(tampered)).toThrow();
    });

    it('throws on truncated ciphertext', () => {
      const encrypted = aesEncrypt('secret');
      const buf = Buffer.from(encrypted, 'base64');
      const truncated = buf.subarray(0, 10).toString('base64');
      expect(() => aesDecrypt(truncated)).toThrow();
    });

    it('throws on invalid base64', () => {
      expect(() => aesDecrypt('not-valid-base64!!!')).toThrow();
    });

    it('produces base64 output', () => {
      const encrypted = aesEncrypt('test');
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();
      const buf = Buffer.from(encrypted, 'base64');
      // IV (12) + tag (16) + at least some ciphertext
      expect(buf.length).toBeGreaterThanOrEqual(28);
    });
  });
});
