import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { configuration } from '../../../config/configuration';
import type { SocialProfile, SocialVerifier } from './social-verifier.port';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCodes } from '../../../common/errors/error-codes';

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_RELAY_DOMAIN = '@privaterelay.appleid.com';

/**
 * AppleVerifier — validates Apple ID tokens via Apple's JWKS endpoint (jose).
 * Audience is APPLE_CLIENT_ID (the Service ID registered for Sign in with Apple).
 *
 * NOTE: Implemented but not verified against live Apple APIs — requires real credentials.
 */
@Injectable()
export class AppleVerifier implements SocialVerifier {
  private readonly logger = new Logger(AppleVerifier.name);
  private readonly jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

  async verify(token: string): Promise<SocialProfile> {
    const clientId = configuration.APPLE_CLIENT_ID;
    if (!clientId) {
      throw AppError.unauthorized(ErrorCodes.AUTH_SOCIAL_TOKEN_INVALID, 'Apple client ID not configured');
    }

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: APPLE_ISSUER,
        audience: clientId,
        algorithms: ['RS256'],
      });

      const email = (payload['email'] as string | undefined) ?? null;
      const emailVerified = payload['email_verified'] === true || payload['email_verified'] === 'true';
      const isPrivateRelay = email?.endsWith(APPLE_RELAY_DOMAIN) ?? false;

      return {
        providerId: payload.sub!,
        email,
        emailVerified,
        isPrivateRelay,
      };
    } catch (err) {
      this.logger.warn(`Apple token verification failed: ${(err as Error).message}`);
      throw AppError.unauthorized(ErrorCodes.AUTH_SOCIAL_TOKEN_INVALID);
    }
  }
}
