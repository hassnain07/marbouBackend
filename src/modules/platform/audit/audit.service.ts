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
 * Normalise a before/after value for both Prisma write and canonical-JSON hash.
 *
 * Rules:
 *  - undefined / null  → null in the canonical payload AND Prisma.JsonNull for
 *    the DB write (Prisma requires explicit JsonNull to store SQL NULL in a
 *    nullable Json? column; passing JS null raises a Prisma type error).
 *  - everything else   → passed through as-is.
 *
 * The canonical payload uses `null` (not Prisma.JsonNull) so verifyChain produces
 * the same hash whether the rows were written via record() or replayed later.
 */
function toJsonValue(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);
}

function toCanonical(v: unknown): unknown {
  return v == null ? null : v;
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
    const created = await this.prisma.$transaction(async (tx) => {
      // Serialise: block other writers until this transaction commits.
      // Uses $executeRaw because pg_advisory_xact_lock returns void; $queryRaw
      // fails to deserialize a void column.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`);

      const last = await tx.$queryRaw<{ hash: string }[]>(
        Prisma.sql`SELECT hash FROM "AuditLog" ORDER BY id DESC LIMIT 1`,
      );
      const prevHash = last[0]?.hash ?? AUDIT_GENESIS_HASH;

      const createdAt = new Date();
      // Canonical payload: null (not Prisma.JsonNull) for absent before/after so
      // verifyChain reproduces the same hash regardless of write path.
      const entryPayload = {
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        before: toCanonical(input.before),
        after: toCanonical(input.after),
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
          // Use Prisma.JsonNull to write SQL NULL into Json? columns.
          before: toJsonValue(input.before),
          after: toJsonValue(input.after),
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
   * Verify the chain in batches of BATCH_SIZE rows to avoid loading the whole
   * table into memory (item 8).
   */
  async verifyChain(): Promise<VerifyResult> {
    const BATCH_SIZE = 1000;
    let prevHash = AUDIT_GENESIS_HASH;
    let checked = 0;
    let lastId: bigint | undefined;

    while (true) {
      const rows = await this.prisma.auditLog.findMany({
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(lastId !== undefined ? { cursor: { id: lastId }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        const entryPayload = {
          actorType: row.actorType,
          actorId: row.actorId,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          // toCanonical: DB stores SQL NULL as Prisma null; normalise to JS null
          // to match the canonical form used at write time.
          before: row.before ?? null,
          after: row.after ?? null,
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
      lastId = rows[rows.length - 1].id;
      if (rows.length < BATCH_SIZE) break;
    }
    return { valid: true, checked };
  }
}
