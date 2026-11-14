import { AuditService } from './audit.service';
import { AUDIT_GENESIS_HASH } from './audit.constants';
import { sha256, canonicalJson } from '../../../common/utils/crypto';

function buildService() {
  const rows: Array<Record<string, unknown>> = [];
  let nextId = BigInt(1);

  const mockTx = {
    $executeRaw: jest.fn().mockResolvedValue(0), // pg_advisory_xact_lock returns void/0
    $queryRaw: jest.fn().mockImplementation(async (sqlOrStrings: any) => {
      // Handle Prisma.sql objects
      const sql = typeof sqlOrStrings === 'object' && sqlOrStrings?.strings
        ? sqlOrStrings.strings.join('')
        : String(sqlOrStrings ?? '');
      if (sql.includes('SELECT hash')) {
        return rows.length ? [{ hash: (rows[rows.length - 1] as any).hash }] : [];
      }
      return [];
    }),
    auditLog: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const row = { ...data, id: nextId };
        rows.push(row);
        nextId = nextId + BigInt(1);
        return row;
      }),
    },
  };

  const prisma: any = {
    $transaction: jest.fn((fn: any) => fn(mockTx)),
    auditLog: { findMany: jest.fn(() => Promise.resolve(rows)) },
  };

  const service = new AuditService(prisma);
  return { service, rows, prisma };
}

describe('AuditService', () => {
  it('first record uses genesis hash as prevHash', async () => {
    const { service, rows } = buildService();
    await service.record({
      actorType: 'ADMIN',
      actorId: 'admin-1',
      action: 'flag.patch',
      entity: 'FeatureFlag',
      entityId: 'otp.email',
      before: { enabled: true },
      after: { enabled: false },
    });
    const row = rows[0] as any;
    expect(row.prevHash).toBe(AUDIT_GENESIS_HASH);
    expect(row.hash).toHaveLength(64);
  });

  it('each row chains to the previous hash', async () => {
    const { service, rows } = buildService();
    for (let i = 0; i < 5; i++) {
      await service.record({
        actorType: 'ADMIN',
        actorId: `actor-${i}`,
        action: 'test',
        entity: 'Entity',
        entityId: `${i}`,
      });
    }
    for (let i = 1; i < rows.length; i++) {
      expect((rows[i] as any).prevHash).toBe((rows[i - 1] as any).hash);
    }
  });

  it('verifyChain returns valid:true for a clean chain', async () => {
    const { service } = buildService();
    await service.record({
      actorType: 'SYSTEM', actorId: 's', action: 'a', entity: 'E', entityId: '1',
    });
    await service.record({
      actorType: 'ADMIN', actorId: 'a', action: 'b', entity: 'E', entityId: '2',
    });
    const result = await service.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(2);
  });

  it('verifyChain detects tampered hash', async () => {
    const { service, rows } = buildService();
    await service.record({ actorType: 'ADMIN', actorId: 'a', action: 'x', entity: 'E', entityId: '1' });
    // Tamper the hash directly in the in-memory mock.
    (rows[0] as any).hash = 'tampered'.padEnd(64, '0');
    const result = await service.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAtId).toBe('1');
  });

  it('hash is deterministic: SHA256(prevHash + canonicalJson(payload))', async () => {
    const { service, rows } = buildService();
    await service.record({
      actorType: 'ADMIN',
      actorId: 'actor',
      action: 'flag.patch',
      entity: 'FeatureFlag',
      entityId: 'otp.email',
      before: { enabled: true },
      after: { enabled: false },
    });
    const row = rows[0] as any;
    const payload = {
      actorType: row.actorType,
      actorId: row.actorId,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      before: row.before,
      after: row.after,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    };
    const expected = sha256(AUDIT_GENESIS_HASH + canonicalJson(payload));
    expect(row.hash).toBe(expected);
  });
});
