import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { encodeCursor, decodeCursor } from '../../../common/dto/pagination.dto';

export interface AuditFilter {
  entity?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  fromDate?: Date;
  toDate?: Date;
}

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Fetch the last row (the head of the chain). Called inside a transaction. */
  async getLastLocked(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<{ id: bigint; hash: string }[]>(
      Prisma.sql`SELECT id, hash FROM "AuditLog" ORDER BY id DESC LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  /** Insert a new row inside the given transaction client. */
  async insertInTx(
    tx: Prisma.TransactionClient,
    data: {
      actorType: string;
      actorId: string;
      action: string;
      entity: string;
      entityId: string;
      before: unknown;
      after: unknown;
      prevHash: string;
      hash: string;
    },
  ) {
    return tx.auditLog.create({
      data: {
        actorType: data.actorType,
        actorId: data.actorId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        before: (data.before ?? null) as Prisma.InputJsonValue,
        after: (data.after ?? null) as Prisma.InputJsonValue,
        prevHash: data.prevHash,
        hash: data.hash,
      },
    });
  }

  /** Cursor-paginated list with filters. */
  async list(
    filter: AuditFilter,
    limit: number,
    cursor?: string,
  ): Promise<{ items: AuditLogRow[]; nextCursor: string | null }> {
    const decoded = decodeCursor(cursor);
    const idAfter = decoded && typeof decoded.id === 'string' ? BigInt(decoded.id) : null;

    const where: Prisma.AuditLogWhereInput = {};
    if (filter.entity) where.entity = filter.entity;
    if (filter.entityId) where.entityId = filter.entityId;
    if (filter.actorId) where.actorId = filter.actorId;
    if (filter.action) where.action = filter.action;
    if (filter.fromDate || filter.toDate) {
      where.createdAt = {};
      if (filter.fromDate) where.createdAt.gte = filter.fromDate;
      if (filter.toDate) where.createdAt.lte = filter.toDate;
    }
    if (idAfter !== null) {
      where.id = { lt: idAfter };
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const nextCursor = hasMore
      ? encodeCursor({ id: rows[rows.length - 1].id.toString() })
      : null;

    return { items: rows as AuditLogRow[], nextCursor };
  }

  /** Stream all rows in ascending id order for chain verification. */
  async streamAll(): Promise<AuditLogRow[]> {
    return this.prisma.auditLog.findMany({ orderBy: { id: 'asc' } }) as Promise<AuditLogRow[]>;
  }
}

/** AuditLog row with BigInt serialised to string for JSON safety. */
export interface AuditLogRow {
  id: bigint;
  actorType: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  prevHash: string;
  hash: string;
  createdAt: Date;
}
