import { AdminRole } from '@prisma/client';
import { can, ADMIN_PERMISSIONS, type AdminPermissionKey } from './admin-permissions';

/**
 * Table-driven RBAC permission matrix tests (B, A2).
 *
 * PRD §5 matrix:
 *   MOD  = Content Moderator
 *   SUP  = Support Agent
 *   FIN  = Financial Auditor
 *   SA   = Super Admin
 *
 * "MOD cannot reach finance/flags/EAV, FIN cannot touch audit writes or admin roles."
 */

const SA = AdminRole.SUPER_ADMIN;
const MOD = AdminRole.CONTENT_MODERATOR;
const SUP = AdminRole.SUPPORT_AGENT;
const FIN = AdminRole.FINANCIAL_AUDITOR;

describe('RBAC permission matrix', () => {
  /**
   * Exhaustive table: [permission, SA, MOD, SUP, FIN]
   * true = should be allowed, false = should be denied.
   */
  const matrix: Array<[AdminPermissionKey, boolean, boolean, boolean, boolean]> = [
    // Config (SA only)
    ['config.flags.read', true, false, false, false],
    ['config.flags.write', true, false, false, false],
    ['config.media-limits.read', true, false, false, false],
    ['config.media-limits.write', true, false, false, false],
    ['config.app-versions.write', true, false, false, false],
    ['config.maintenance.write', true, false, false, false],
    ['config.defaults.read', true, false, false, false],
    ['config.defaults.write', true, false, false, false],
    ['config.otp-channels.write', true, false, false, false],
    ['config.eav.write', true, false, false, false], // MOD cannot reach EAV (PRD §5)

    // Moderation (MOD, SA)
    ['moderation.listings.write', true, true, false, false],
    ['moderation.users.write', true, true, false, false],
    ['moderation.reports.read', true, true, false, false],
    ['moderation.reports.write', true, true, false, false],
    ['moderation.appeals.read', true, true, false, false],
    ['moderation.appeals.write', true, true, false, false],

    // Support (SUP, SA)
    ['support.tickets.read', true, false, true, false],
    ['support.tickets.write', true, false, true, false],
    ['support.cv-queue.read', true, false, true, false],
    ['support.cv-queue.write', true, false, true, false],
    ['verification.queue.read', true, false, true, false],
    ['verification.queue.write', true, false, true, false],

    // Payments (FIN, SA) — MOD cannot reach finance (PRD §5)
    ['payments.console.read', true, false, false, true],
    ['payments.console.write', true, false, false, true],
    ['payments.refunds.write', true, false, false, true],

    // Audit read-only (FIN, SA)
    ['audit.read', true, false, false, true],

    // Admin management (SA only) — FIN cannot touch admin roles (PRD §5)
    ['admin.users.manage', true, false, false, false],
    ['admin.sessions.manage', true, false, false, false],
    ['admin.login-logs.read', true, false, false, false],

    // User search (SUP, SA)
    ['users.search', true, false, true, false],

    // Analytics (SA)
    ['analytics.read', true, false, false, false],

    // System health (SA)
    ['system.health.read', true, false, false, false],
  ];

  it('covers every permission key in ADMIN_PERMISSIONS', () => {
    const testedKeys = new Set(matrix.map(([key]) => key));
    const definedKeys = Object.keys(ADMIN_PERMISSIONS) as AdminPermissionKey[];
    for (const key of definedKeys) {
      expect(testedKeys.has(key)).toBe(true);
    }
  });

  describe.each(matrix)('%s', (permission, saAllowed, modAllowed, supAllowed, finAllowed) => {
    it(`SA → ${saAllowed ? 'allow' : 'deny'}`, () => {
      expect(can(SA, permission)).toBe(saAllowed);
    });

    it(`MOD → ${modAllowed ? 'allow' : 'deny'}`, () => {
      expect(can(MOD, permission)).toBe(modAllowed);
    });

    it(`SUP → ${supAllowed ? 'allow' : 'deny'}`, () => {
      expect(can(SUP, permission)).toBe(supAllowed);
    });

    it(`FIN → ${finAllowed ? 'allow' : 'deny'}`, () => {
      expect(can(FIN, permission)).toBe(finAllowed);
    });
  });

  describe('PRD §5 specific constraints', () => {
    it('MOD cannot reach finance/payments', () => {
      expect(can(MOD, 'payments.console.read')).toBe(false);
      expect(can(MOD, 'payments.console.write')).toBe(false);
      expect(can(MOD, 'payments.refunds.write')).toBe(false);
    });

    it('MOD cannot reach flags', () => {
      expect(can(MOD, 'config.flags.read')).toBe(false);
      expect(can(MOD, 'config.flags.write')).toBe(false);
    });

    it('MOD cannot reach EAV', () => {
      expect(can(MOD, 'config.eav.write')).toBe(false);
    });

    it('FIN cannot touch audit writes or admin roles', () => {
      // FIN can read audit but cannot manage admin roles (write operations on admin mgmt)
      expect(can(FIN, 'audit.read')).toBe(true);
      expect(can(FIN, 'admin.users.manage')).toBe(false);
      expect(can(FIN, 'admin.sessions.manage')).toBe(false);
    });

    it('FIN can read audit logs', () => {
      expect(can(FIN, 'audit.read')).toBe(true);
    });

    it('SA has all permissions', () => {
      const allKeys = Object.keys(ADMIN_PERMISSIONS) as AdminPermissionKey[];
      for (const key of allKeys) {
        expect(can(SA, key)).toBe(true);
      }
    });
  });
});
