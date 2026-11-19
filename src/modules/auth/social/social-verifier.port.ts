/**
 * SocialVerifierPort — interface for server-side social token verification.
 * Implementations: GoogleVerifier, FacebookVerifier, AppleVerifier (all Phase 3).
 * SandboxVerifier: used only when INTEGRATIONS_MODE=mock AND NODE_ENV is dev/test.
 *
 * NOTE: Real adapters are implemented but NOT verified against live providers
 * (requires real credentials). See README for details.
 */

export interface SocialProfile {
  providerId: string;
  email: string | null;
  emailVerified: boolean;
  /** True when email is an Apple private relay address (@privaterelay.appleid.com). */
  isPrivateRelay?: boolean;
  displayName?: string;
}

export interface SocialVerifier {
  verify(token: string): Promise<SocialProfile>;
}

export const GOOGLE_VERIFIER = 'GOOGLE_VERIFIER';
export const FACEBOOK_VERIFIER = 'FACEBOOK_VERIFIER';
export const APPLE_VERIFIER = 'APPLE_VERIFIER';
