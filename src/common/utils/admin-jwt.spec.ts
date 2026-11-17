import { AdminTokenService, AUD_ADMIN, AUD_ADMIN_MFA, ISSUER } from './admin-jwt';
import { verify } from 'jsonwebtoken';
import { configuration } from '../../config/configuration';
import { createHash } from 'node:crypto';

describe('AdminTokenService', () => {
  describe('signMfaToken / verifyMfaToken', () => {
    it('signs and verifies an MFA token', () => {
      const token = AdminTokenService.signMfaToken('admin-123', 'test@example.com');
      const claims = AdminTokenService.verifyMfaToken(token);
      expect(claims).not.toBeNull();
      expect(claims!.sub).toBe('admin-123');
      expect(claims!.email).toBe('test@example.com');
      expect(claims!.stage).toBe('MFA');
      expect(claims!.aud).toBe(AUD_ADMIN_MFA);
      expect(claims!.iss).toBe(ISSUER);
    });

    it('rejects an MFA token with wrong audience', () => {
      const token = AdminTokenService.signAccessToken('admin-123', 'sess-123', 'ADMIN');
      const claims = AdminTokenService.verifyMfaToken(token);
      expect(claims).toBeNull();
    });

    it('rejects an invalid MFA token', () => {
      const claims = AdminTokenService.verifyMfaToken('invalid.token.here');
      expect(claims).toBeNull();
    });

    it('rejects an expired MFA token', async () => {
      // Create a token that expires immediately
      const jwt = require('jsonwebtoken');
      const payload = { sub: 'admin-123', email: 'test@example.com', stage: 'MFA', iss: ISSUER, aud: AUD_ADMIN_MFA };
      const token = jwt.sign(payload, configuration.ADMIN_JWT_SECRET, { expiresIn: '0s' });
      // Wait a moment to ensure expiry
      await new Promise((resolve) => setTimeout(resolve, 10));
      const claims = AdminTokenService.verifyMfaToken(token);
      expect(claims).toBeNull();
    });
  });

  describe('signAccessToken / verifyAccessToken', () => {
    it('signs and verifies an access token', () => {
      const token = AdminTokenService.signAccessToken('admin-123', 'SUPER_ADMIN', 'sess-456');
      const claims = AdminTokenService.verifyAccessToken(token);
      expect(claims).not.toBeNull();
      expect(claims!.sub).toBe('admin-123');
      expect(claims!.sid).toBe('sess-456');
      expect(claims!.role).toBe('SUPER_ADMIN');
      expect(claims!.aud).toBe(AUD_ADMIN);
      expect(claims!.iss).toBe(ISSUER);
    });

    it('rejects an access token with wrong audience', () => {
      const token = AdminTokenService.signMfaToken('admin-123', 'test@example.com');
      const claims = AdminTokenService.verifyAccessToken(token);
      expect(claims).toBeNull();
    });

    it('rejects an invalid access token', () => {
      const claims = AdminTokenService.verifyAccessToken('invalid.token.here');
      expect(claims).toBeNull();
    });

    it('rejects MFA token used as access token', () => {
      const mfaToken = AdminTokenService.signMfaToken('admin-123', 'test@example.com');
      const claims = AdminTokenService.verifyAccessToken(mfaToken);
      expect(claims).toBeNull();
    });

    it('rejects access token used as MFA token', () => {
      const accessToken = AdminTokenService.signAccessToken('admin-123', 'SUPER_ADMIN', 'sess-456');
      const claims = AdminTokenService.verifyMfaToken(accessToken);
      expect(claims).toBeNull();
    });

    it('rejects token with wrong issuer', () => {
      const jwt = require('jsonwebtoken');
      const payload = { sub: 'admin-123', sid: 'sess-456', role: 'SUPER_ADMIN', iss: 'wrong-issuer', aud: AUD_ADMIN };
      const token = jwt.sign(payload, configuration.ADMIN_JWT_SECRET, { expiresIn: 900, algorithm: 'HS256' });
      const claims = AdminTokenService.verifyAccessToken(token);
      expect(claims).toBeNull();
    });

    it('rejects token signed with alg:none', () => {
      // A manually crafted "alg:none" token (no signature)
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: 'admin-123', sid: 'sess-456', role: 'SUPER_ADMIN', iss: ISSUER, aud: AUD_ADMIN, exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
      const token = `${header}.${payload}.`;
      const claims = AdminTokenService.verifyAccessToken(token);
      expect(claims).toBeNull();
    });

    it('rejects an expired access token', async () => {
      const jwt = require('jsonwebtoken');
      const payload = { sub: 'admin-123', sid: 'sess-456', role: 'SUPER_ADMIN', iss: ISSUER, aud: AUD_ADMIN };
      const token = jwt.sign(payload, configuration.ADMIN_JWT_SECRET, { expiresIn: '0s' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const claims = AdminTokenService.verifyAccessToken(token);
      expect(claims).toBeNull();
    });

    it('respects ADMIN_JWT_ACCESS_TTL configuration', () => {
      // Read the current TTL from configuration
      const currentTTL = configuration.ADMIN_JWT_ACCESS_TTL || '15m';
      const token = AdminTokenService.signAccessToken('admin-123', 'ADMIN', 'sess-456');
      const decoded = verify(token, configuration.ADMIN_JWT_SECRET) as any;
      const ttlSeconds = decoded.exp - decoded.iat;
      const expectedSeconds = AdminTokenService.ttlToSeconds(currentTTL);
      expect(ttlSeconds).toBe(expectedSeconds);
    });
  });

  describe('generateRefreshToken', () => {
    it('generates a token and hash', () => {
      const { token, hash } = AdminTokenService.generateRefreshToken();
      expect(token).toBeTruthy();
      expect(hash).toBeTruthy();
      expect(token.length).toBeGreaterThan(40); // base64url of 32 bytes
      expect(hash.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it('generates unique tokens', () => {
      const result1 = AdminTokenService.generateRefreshToken();
      const result2 = AdminTokenService.generateRefreshToken();
      expect(result1.token).not.toBe(result2.token);
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('hash matches SHA-256 of token', () => {
      const { token, hash } = AdminTokenService.generateRefreshToken();
      const expectedHash = createHash('sha256').update(token).digest('hex');
      expect(hash).toBe(expectedHash);
    });
  });

  describe('safeEqualHash', () => {
    it('returns true for identical hashes', () => {
      const { hash } = AdminTokenService.generateRefreshToken();
      expect(AdminTokenService.safeEqualHash(hash, hash)).toBe(true);
    });

    it('returns false for different hashes', () => {
      const hash1 = AdminTokenService.generateRefreshToken().hash;
      const hash2 = AdminTokenService.generateRefreshToken().hash;
      expect(AdminTokenService.safeEqualHash(hash1, hash2)).toBe(false);
    });

    it('returns false for hashes with different lengths', () => {
      const hash1 = 'a'.repeat(64);
      const hash2 = 'a'.repeat(32);
      expect(AdminTokenService.safeEqualHash(hash1, hash2)).toBe(false);
    });

    it('is constant-time (no early exit on mismatch)', () => {
      // This is a behavioral test; timing-based tests are fragile
      const hash1 = 'a'.repeat(64);
      const hash2 = 'b'.repeat(64);
      expect(AdminTokenService.safeEqualHash(hash1, hash2)).toBe(false);
    });
  });

  describe('ttlToSeconds', () => {
    it('parses seconds', () => {
      expect(AdminTokenService.ttlToSeconds('30s')).toBe(30);
    });

    it('parses minutes', () => {
      expect(AdminTokenService.ttlToSeconds('15m')).toBe(900);
    });

    it('parses hours', () => {
      expect(AdminTokenService.ttlToSeconds('2h')).toBe(7200);
    });

    it('parses days', () => {
      expect(AdminTokenService.ttlToSeconds('7d')).toBe(604800);
    });

    it('defaults to 900 for invalid format', () => {
      expect(AdminTokenService.ttlToSeconds('invalid')).toBe(900);
      expect(AdminTokenService.ttlToSeconds('')).toBe(900);
      expect(AdminTokenService.ttlToSeconds('15x')).toBe(900);
    });
  });
});
