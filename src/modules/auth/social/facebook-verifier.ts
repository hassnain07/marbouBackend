import { Injectable, Logger } from '@nestjs/common';
import { configuration } from '../../../config/configuration';
import type { SocialProfile, SocialVerifier } from './social-verifier.port';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCodes } from '../../../common/errors/error-codes';

/**
 * FacebookVerifier — validates Facebook user access tokens via the Graph API.
 * Exchanges app-token to verify the user token's intended audience.
 *
 * NOTE: Implemented but not verified against live Facebook APIs — requires real credentials.
 */
@Injectable()
export class FacebookVerifier implements SocialVerifier {
  private readonly logger = new Logger(FacebookVerifier.name);

  async verify(token: string): Promise<SocialProfile> {
    const appId = configuration.FACEBOOK_APP_ID;
    const appSecret = configuration.FACEBOOK_APP_SECRET;

    if (!appId || !appSecret) {
      throw AppError.unauthorized(ErrorCodes.AUTH_SOCIAL_TOKEN_INVALID, 'Facebook credentials not configured');
    }

    try {
      // 1. Get app access token
      const appTokenUrl = `https://graph.facebook.com/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`;
      const appTokenRes = await fetch(appTokenUrl);
      const { access_token: appToken } = (await appTokenRes.json()) as { access_token: string };

      // 2. Debug/inspect the user token
      const debugUrl = `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${appToken}`;
      const debugRes = await fetch(debugUrl);
      const { data } = (await debugRes.json()) as { data: { user_id?: string; is_valid?: boolean; app_id?: string } };

      if (!data?.is_valid || !data.user_id || data.app_id !== appId) {
        throw new Error('Invalid token');
      }

      // 3. Fetch user email
      const meUrl = `https://graph.facebook.com/${data.user_id}?fields=email&access_token=${token}`;
      const meRes = await fetch(meUrl);
      const me = (await meRes.json()) as { email?: string; id: string };

      return {
        providerId: me.id,
        email: me.email ?? null,
        // Facebook does not expose a verified flag for email; treat as verified if present
        emailVerified: !!me.email,
      };
    } catch (err) {
      this.logger.warn(`Facebook token verification failed: ${(err as Error).message}`);
      throw AppError.unauthorized(ErrorCodes.AUTH_SOCIAL_TOKEN_INVALID);
    }
  }
}
