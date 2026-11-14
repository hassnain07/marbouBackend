/** Genesis hash for the first audit row (no previous row exists). */
export const AUDIT_GENESIS_HASH = '0'.repeat(64);

/** Postgres advisory-lock key used to serialise audit-chain writes so parallel
 *  `record()` calls never fork the chain. Transaction-scoped (pg_advisory_xact_lock). */
export const AUDIT_LOCK_KEY = 7423891;

export const AuditActorType = {
  ADMIN: 'ADMIN',
  SYSTEM: 'SYSTEM',
  USER: 'USER',
} as const;
export type AuditActorType = (typeof AuditActorType)[keyof typeof AuditActorType];
