/**
 * core-bridge — single import surface for the shared `@ahmed-org/marketplace-core`
 * package (architecture §2, §4). When the package is published it is re-exported
 * here; until then these thin local shims live here so both MARBOU and Sayaratak
 * swap implementations by editing one file. Import from `@shared/core-bridge`.
 *
 * Re-exports the response envelope types and money/currency helpers shared with
 * the clients, plus the global domain-event contract names.
 */
export type {
  SuccessEnvelope,
  ErrorEnvelope,
  PaginatedResult,
} from '../../common/envelope';

export { paginated } from '../../common/envelope';
export { localizeError } from '../../common/i18n/messages';

import { Currency } from '@prisma/client';
export { Currency };

/** Money domain type used by both server and clients. */
export interface Money {
  amount: number;
  currency: Currency;
}

/** Format a money amount for display (Arabic-first). Never silently converts
 *  currency — conversion indicators are computed separately (LOC-04, PAY-11). */
export function formatMoney(money: Money, locale: 'ar' | 'en' = 'ar'): string {
  const formatted = new Intl.NumberFormat(locale === 'ar' ? 'ar-SD' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(money.amount);
  return `${formatted} ${money.currency}`;
}

/** Domain event names — the contract between modules (architecture §3). The
 *  same names are published to the Socket.io layer and consumed by listeners. */
export const DomainEvent = {
  LISTING_PUBLISHED: 'listing.published',
  LISTING_EDITED: 'listing.edited',
  LISTING_STATUS_CHANGED: 'listing.status_changed',
  LISTING_EXPIRED: 'listing.expired',
  LISTING_SOLD: 'listing.sold',
  MESSAGE_NEW: 'message.new',
  OFFER_NEW: 'offer.new',
  OFFER_ACCEPTED: 'offer.accepted',
} as const;

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent];

/**
 * NOTE: When `@ahmed-org/marketplace-core` becomes installable, replace the
 * bodies above with `export * from '@ahmed-org/marketplace-core';` and remove
 * the local implementations. The public surface stays identical so callers
 * never change.
 */
