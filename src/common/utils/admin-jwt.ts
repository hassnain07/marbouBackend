import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { sign, verify, type JwtPayload } from 'jsonwebtoken';
import { configuration } from '../../config/configuration';

/**
 * Admin JWT utilities (AUTH-20, NFR-SEC-03).
 *
 * Two token types, both signed with ADMIN_JWT_SECRET but with DIFFERENT audiences
 * so an MFA-stage token cannot call admin routes and a user-audience token (Phase 3)
 * cannot call admin routes:
 *
 *   - MFA-stage token: audience `marbou-admin-mfa`, short-lived (5 min).
 *     Only valid for /admin/auth/2fa/* . Carries: sub=adminId, email, stage.
 *   - Admin access token: audience `marbou-admin`, short-lived (ADMIN_JWT_ACCESS_TTL).
 *     Carries: sub=adminId, sid=sessionId, role.
 *
 * Refresh tokens are opaque (not JWT): a 32-byte random value, base64url. Only the
 * SHA-256 hash is stored in AdminSession.refreshTokenHash.
 */

const ISSUER = 'marbou';
const AUD_ADMIN = 'marbou-admin';
const AUD_ADMIN_MFA = 'marbou-admin-mfa';

export interface AdminAccessClaims extends JwtPayload {
  sub: string;
  sid: string;
  role: string;
}

export interface AdminMfaClaims extends JwtPayload {
  sub: string;
  email: string;
  stage: 'MFA';
}

export const AdminTokenService = {
  signMfaToken(adminId: string, email: string): string {
    const payload: AdminMfaClaims = { sub: adminId, email, stage: 'MFA', iss: ISSUER, aud: AUD_ADMIN_MFA };
    return sign(payload, configuration.ADMIN_JWT_SECRET, { expiresIn: 300 }); // 5 min
  },

  signAccessToken(adminId: string, role: string, sessionId: string): string {
    const ttlSeconds = AdminTokenService.ttlToSeconds(configuration.ADMIN_JWT_ACCESS_TTL || '15m');
    const payload: AdminAccessClaims = { sub: adminId, sid: sessionId, role, iss: ISSUER, aud: AUD_ADMIN };
    return sign(payload, configuration.ADMIN_JWT_SECRET, { expiresIn: ttlSeconds });
  },

  verifyMfaToken(token: string): AdminMfaClaims | null {
    try {
      const payload = verify(token, configuration.ADMIN_JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUD_ADMIN_MFA,
      });
      const c = payload as AdminMfaClaims;
      if (c.stage !== 'MFA') return null;
      return c;
    } catch {
      return null;
    }
  },

  verifyAccessToken(token: string): AdminAccessClaims | null {
    try {
      const payload = verify(token, configuration.ADMIN_JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUD_ADMIN,
      });
      return payload as AdminAccessClaims;
    } catch {
      return null;
    }
  },

  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    return { token, hash };
  },

  safeEqualHash(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  },

  ttlToSeconds(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl);
    if (!m) return 900;
    const n = Number(m[1]);
    switch (m[2]) {
      case 's':
        return n;
      case 'm':
        return n * 60;
      case 'h':
        return n * 3600;
      case 'd':
        return n * 86400;
      default:
        return 900;
    }
  },
};

export { AUD_ADMIN, AUD_ADMIN_MFA, ISSUER };
