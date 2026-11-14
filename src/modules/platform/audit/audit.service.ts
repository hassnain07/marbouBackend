import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { canonicalJson, sha256 } from '../../../common/utils/crypto';
import { AUDIT_GENESIS_HASH, AUDIT_LOCK_KEY, type AuditActorType } from './audit.constants';
import type { AuditLogRow } from './audit.repository';

export interface RecordInput {
  actorType: AuditActorType;
  actorId: string; // pseudonymous id; never PII
  action: string;
  entity: string;
  entityId: string;
  /** Pre-change snapshot — IDs only, no personal data (TRS-12). */
  before?: unknown;
  /** Post-change snapshot — IDs only, no personal data (TRS-12). */
  after?: unknown;
}

export interface VerifyResult {
  valid: boolean;
  checked: number;
  brokenAtId?: string;
}

/**
 * AuditService — append-only, hash-chained, tamper-evident audit log
 * (architecture §5.9, TRS-12, SYS-10, ADM-19).
 *
 * Each row's `hash = SHA256(prevHash + canonicalJson(entry))`. Writes are
 * serialised through a Postgres transaction-scoped advisory lock so concurrent
 * `record()` calls never fork the chain. The `AuditLog` table is also protected
 * by a DB trigger (platform_phase1 migration) that rejects UPDATE/DELETE.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordInput): Promise<AuditLogRow> {
    // The whole chain-append is one serialised transaction.
    const created = await this.prisma.$transaction(async (tx) => {
      // Serialise: block other writers until this transaction commits.
      // We use $executeRaw (not $queryRaw) because pg_advisory_xact_lock returns
      // void and $queryRaw fails to deserialize a void column.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`);

      const last = await tx.$queryRaw<{ hash: string }[]>(
        Prisma.sql`SELECT hash FROM "AuditLog" ORDER BY id DESC LIMIT 1`,
      );
      const prevHash = last[0]?.hash ?? AUDIT_GENESIS_HASH;

      const createdAt = new Date();
      // The hash covers everything EXCEPT the row's own autoincrement id and the
      // hash itself. before/after must contain IDs only (no PII).
      const entryPayload = {
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        before: input.before ?? null,
        after: input.after ?? null,
        createdAt: createdAt.toISOString(),
      };
      const hash = sha256(prevHash + canonicalJson(entryPayload));

      const row = await tx.auditLog.create({
        data: {
          actorType: input.actorType,
          actorId: input.actorId,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          before: (input.before ?? null) as never,
          after: (input.after ?? null) as never,
          prevHash,
          hash,
          createdAt,
        },
      });
      return row as unknown as AuditLogRow;
    });
    return created;
  }

  /**
   * Verify the chain: recompute every row's hash from its prevHash + canonical
   * payload and compare to the stored hash. Returns the first broken row id (if
   * any). Used by GET /admin/audit-logs/verify-chain (ADM-19).
   */
  async verifyChain(): Promise<VerifyResult> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
    let prevHash = AUDIT_GENESIS_HASH;
    let checked = 0;
    for (const row of rows) {
      const entryPayload = {
        actorType: row.actorType,
        actorId: row.actorId,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      };
      const expected = sha256(prevHash + canonicalJson(entryPayload));
      checked += 1;
      if (expected !== row.hash) {
        this.logger.error(`Audit chain broken at id=${row.id.toString()}`);
        return { valid: false, checked, brokenAtId: row.id.toString() };
      }
      prevHash = row.hash;
    }
    return { valid: true, checked };
  }
}
