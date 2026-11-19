import { Injectable, Logger } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { configuration } from '../../../config/configuration';
import type { SocialProfile, SocialVerifier } from './social-verifier.port';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCodes } from '../../../common/errors/error-codes';

/**
 * GoogleVerifier — validates Google ID tokens server-side using google-auth-library.
 * Uses GOOGLE_CLIENT_IDS (comma-separated) as audience.
 *
 * NOTE: Implemented but not verified against live Google APIs — requires real client IDs.
 */
@Injectable()
export class GoogleVerifier implements SocialVerifier {
  private readonly logger = new Logger(GoogleVerifier.name);
  private readonly client = new OAuth2Client();

  async verify(token: string): Promise<SocialProfile> {
    const clientIds = (configuration.GOOGLE_CLIENT_IDS ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    if (!clientIds.length) {
      throw AppError.unauthorized(ErrorCodes.AUTH_SOCIAL_TOKEN_INVALID, 'Google client IDs not configured');
    }

    try {
      const ticket = await this.client.verifyIdToken({ idToken: token, audience: clientIds });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        throw new Error('No payload or sub');
      }
      return {
        providerId: payload.sub,
        email: payload.email ?? null,
        emailVerified: payload.email_verified === true || String(payload.email_verified) === 'true',
      };
    } catch (err) {
      this.logger.warn(`Google token verification failed: ${(err as Error).message}`);
      throw AppError.unauthorized(ErrorCodes.AUTH_SOCIAL_TOKEN_INVALID);
    }
  }
}
