import type { PrismaClient } from '@prisma/client';

/**
 * Seed all feature-flag keys from architecture §9. Idempotent — upsert updates
 * the description and countryOverrides but never toggles an already-persisted
 * `enabled` state so re-seeding doesn't clobber admin changes.
 *
 * PRD defaults:
 *  - otp.email = ON (the only active OTP channel at launch, AUTH-15)
 *  - otp.sms / otp.whatsapp = OFF (handlers built, flag OFF)
 *  - payments.bankak_user_flow = staging ON / production OFF (PRD §7.18 PAY-13)
 *  - media.video_uploads = ON globally
 *  - moderation.delayed_visibility = OFF everywhere (TRS-15)
 *  - ENABLE_MONETIZATION and all monetization.* = OFF (M18)
 *  - wholesale.enabled = OFF (GEN-11)
 *  - hotel.reservations = OFF (HOT-08)
 *  - contact.reveal_policy config: 'guests_with_limit' (DET-13)
 */
interface FlagDef {
  key: string;
  enabled: boolean;
  description: string;
  config?: unknown;
}

export async function seedFlags(prisma: PrismaClient): Promise<void> {
  const isStaging = process.env.NODE_ENV === 'staging';

  const flags: FlagDef[] = [
    // ── OTP channels ──────────────────────────────────────────────────────
    {
      key: 'otp.email',
      enabled: true,
      description: 'Email OTP channel for registration / password reset (AUTH-15). Cannot be disabled when last enabled channel.',
    },
    {
      key: 'otp.sms',
      enabled: false,
      description: 'SMS OTP channel (handlers built, flag OFF at launch, AUTH-13).',
    },
    {
      key: 'otp.whatsapp',
      enabled: false,
      description: 'WhatsApp OTP channel (handlers built, flag OFF at launch, AUTH-14).',
    },

    // ── Payments ──────────────────────────────────────────────────────────
    {
      key: 'payments.bankak_user_flow',
      enabled: isStaging,
      description: 'User-facing Bankak payment submission (PAY-02/03/06/08). Staging=ON, Prod=OFF. PAY-13.',
    },
    {
      key: 'payments.refunds',
      enabled: false,
      description: 'Refund and reversal flow (PAY-12). Flag OFF at launch.',
    },
    {
      key: 'payments.invoices',
      enabled: true,
      description: 'Invoice generation on payment approval (PAY-08). Active.',
    },

    // ── Media ─────────────────────────────────────────────────────────────
    {
      key: 'media.video_uploads',
      enabled: true,
      description: 'Global video upload toggle (MED-06, ADM-10). Per-category overrides in RemoteConfig.mediaLimits.',
    },

    // ── Moderation ────────────────────────────────────────────────────────
    {
      key: 'moderation.delayed_visibility',
      enabled: false,
      description: 'Delayed-visibility mode (TRS-15): hold listings for scan/review before publish. OFF by default everywhere.',
    },

    // ── Contact reveal (DET-13) ───────────────────────────────────────────
    {
      key: 'contact.reveal_policy',
      enabled: true,
      description: 'Contact-reveal policy flag. Config: policy=guests_with_limit|signed_in_only.',
      config: { policy: 'guests_with_limit' },
    },

    // ── Monetization master + per-engine ─────────────────────────────────
    {
      key: 'ENABLE_MONETIZATION',
      enabled: false,
      description: 'Master monetization gate (MON-01). When false all pricing/paywalls return FEATURE_DISABLED.',
    },
    { key: 'monetization.subscriptions', enabled: false, description: 'Subscription plans engine (MON-02).' },
    { key: 'monetization.promotions', enabled: false, description: 'Sponsored listings / promotions engine (MON-03).' },
    { key: 'monetization.credits', enabled: false, description: 'Credits ledger engine (MON-04).' },
    { key: 'monetization.boosts', enabled: false, description: 'Paid boosts and badging (MON-05).' },
    { key: 'monetization.auctions', enabled: false, description: 'Auctions engine (MON-06).' },
    { key: 'monetization.barter', enabled: false, description: 'Barter/exchange engine (MON-07).' },
    { key: 'monetization.asset_rental', enabled: false, description: 'Asset rental engine for non-vehicle listings (MON-08).' },
    { key: 'monetization.orders_cart', enabled: false, description: 'Order and cart engine (MON-09).' },
    { key: 'monetization.delivery', enabled: false, description: 'Delivery fee matrix + courier (MON-10).' },
    { key: 'monetization.admob', enabled: false, description: 'AdMob ad-frame integration (MON-11).' },

    // ── Verticals ─────────────────────────────────────────────────────────
    { key: 'wholesale.enabled', enabled: false, description: 'Wholesale MOQ + tiered pricing engine (GEN-11, Appendix B).' },
    { key: 'hotel.reservations', enabled: false, description: 'Hotel reservation booking engine (HOT-08, Appendix B).' },
  ];

  for (const flag of flags) {
    await (prisma as any).featureFlag.upsert({
      where: { key: flag.key },
      create: {
        key: flag.key,
        enabled: flag.enabled,
        config: flag.config ?? null,
        description: flag.description,
        updatedBy: 'seed',
      },
      // On re-seed: update description/config but DO NOT change `enabled` so
      // admin changes are preserved.
      update: {
        description: flag.description,
        config: flag.config ?? null,
        updatedBy: 'seed',
      },
    });
  }
  console.log(`  ✔ Seeded ${flags.length} feature flags`);
}
