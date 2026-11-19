import { Injectable } from '@nestjs/common';
import type { SocialProfile, SocialVerifier } from './social-verifier.port';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { createHmac } from 'node:crypto';
import { configuration } from '../../../config/configuration';

/**
 * Sandbox social verifier for dev/test only.
 * Token format: JSON payload signed with HMAC-SHA256(payload, OTP_HASH_SECRET).
 * POST /dev/social-token mints these tokens.
 *
 * NEVER available in staging or production.
 */

export interface SandboxTokenPayload {
  provider: string;
  providerId: string;
  email?: string | null;
  emailVerified?: boolean;
  isPrivateRelay?: boolean;
}

export function mintSandboxToken(payload: SandboxTokenPayload): string {
  const body = JSON.stringify(payload);
  const sig = createHmac('sha256', configuration.OTP_HASH_SECRET).update(body).digest('hex');
  return Buffer.from(JSON.stringify({ payload: body, sig })).toString('base64url');
}

@Injectable()
export class SandboxVerifier implements SocialVerifier {
  async verify(token: string): Promise<SocialProfile> {
    if (
      configuration.INTEGRATIONS_MODE !== 'mock' ||
      (configuration.NODE_ENV !== 'development' && configuration.NODE_ENV !== 'test')
    ) {
      throw AppError.unauthorized(ErrorCodes.AUTH_SOCIAL_TOKEN_INVALID, 'Sandbox verifier unavailable');
    }
    try {
      const { payload, sig } = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      const expected = createHmac('sha256', configuration.OTP_HASH_SECRET).update(payload).digest('hex');
      if (sig !== expected) throw new Error('bad sig');
      const data = JSON.parse(payload) as SandboxTokenPayload;
      return {
        providerId: data.providerId,
        email: data.email ?? null,
        emailVerified: data.emailVerified ?? false,
        isPrivateRelay: data.isPrivateRelay ?? false,
      };
    } catch {
      throw AppError.unauthorized(ErrorCodes.AUTH_SOCIAL_TOKEN_INVALID);
    }
  }
}
