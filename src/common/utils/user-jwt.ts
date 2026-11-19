import { sign, verify, type JwtPayload } from 'jsonwebtoken';
import { configuration } from '../../config/configuration';

/**
 * User JWT utilities (Phase 3, AUTH-06).
 *
 * Token types:
 *  - Access token: aud=marbou-user, 15m (or JWT_ACCESS_TTL), carries sub=userId, sid=sessionId.
 *  - Refresh token: opaque 32-byte random, stored as SHA-256 hex hash, never as JWT.
 *
 * Admin tokens (aud=marbou-admin / marbou-admin-mfa) are REJECTED on user routes.
 * User tokens are REJECTED on admin routes.
 */

const ISSUER = 'marbou';
const AUD_USER = 'marbou-user';

export interface UserAccessClaims extends JwtPayload {
  sub: string;    // userId
  sid: string;    // sessionId
}

export const UserTokenService = {
  signAccessToken(userId: string, sessionId: string): string {
    const ttlSeconds = UserTokenService.ttlToSeconds(configuration.JWT_ACCESS_TTL ?? '15m');
    const payload: UserAccessClaims = { sub: userId, sid: sessionId, iss: ISSUER, aud: AUD_USER };
    return sign(payload, configuration.JWT_ACCESS_SECRET, { expiresIn: ttlSeconds });
  },

  verifyAccessToken(token: string): UserAccessClaims | null {
    try {
      const payload = verify(token, configuration.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUD_USER,
      });
      return payload as UserAccessClaims;
    } catch {
      return null;
    }
  },

  ttlToSeconds(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl);
    if (!m) return 900;
    const n = Number(m[1]);
    switch (m[2]) {
      case 's': return n;
      case 'm': return n * 60;
      case 'h': return n * 3600;
      case 'd': return n * 86400;
      default:  return 900;
    }
  },
};

export { AUD_USER, ISSUER };
