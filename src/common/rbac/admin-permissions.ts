import { AdminRole } from '@prisma/client';

/**
 * Table-driven admin RBAC permission map (architecture §5.8 matrix, PRD §5).
 *
 * Each permission key maps to the set of roles allowed to perform that action.
 * Later phases reference keys from this map; never hard-code role checks in guards.
 *
 * Matrix (PRD §5 / architecture §5.8):
 *   MOD (Content Moderator) | SUP (Support Agent) | FIN (Financial Auditor) | SA (Super Admin)
 *   - Hide/suspend/edit/delete listings; suspend/ban users; reports; appeals → MOD, SA
 *   - Support tickets, CV queue, verification queue (staff scope)        → SUP, SA
 *   - Bankak approve/reject; payment console                              → FIN, SA
 *   - Audit logs (read-only)                                              → FIN, SA
 *   - Categories/EAV, flags, media limits, OTP channels, defaults,
 *     admin roles & sessions                                             → SA only
 *
 * "A Moderator must not reach finance, flags or EAV builder; a Finance Auditor
 *  must not alter audit logs or admin roles." [M24 acceptance]
 */

export type AdminPermissionKey =
  // ── Phase 1 platform config (Super Admin only) ──
  | 'config.flags.read'
  | 'config.flags.write'
  | 'config.media-limits.read'
  | 'config.media-limits.write'
  | 'config.app-versions.write'
  | 'config.maintenance.write'
  | 'config.defaults.read'
  | 'config.defaults.write'
  | 'config.otp-channels.write'
  | 'config.eav.write' // categories/attributes — Phase 6
  // ── Trust & Safety (MOD, SA) ──
  | 'moderation.listings.write' // hide/suspend/edit/delete listings
  | 'moderation.users.write' // suspend/ban users
  | 'moderation.reports.read'
  | 'moderation.reports.write' // resolve reports
  | 'moderation.appeals.read'
  | 'moderation.appeals.write'
  // ── Support (SUP, SA) ──
  | 'support.tickets.read'
  | 'support.tickets.write'
  | 'support.cv-queue.read'
  | 'support.cv-queue.write'
  | 'verification.queue.read'
  | 'verification.queue.write'
  // ── Payments (FIN, SA) ──
  | 'payments.console.read'
  | 'payments.console.write' // approve/reject Bankak
  | 'payments.refunds.write'
  // ── Audit (FIN read-only, SA) ──
  | 'audit.read'
  // ── Admin management (SA only) ──
  | 'admin.users.manage' // create/deactivate/change role
  | 'admin.sessions.manage' // revoke sessions
  | 'admin.login-logs.read'
  // ── User management basics (SUP, SA) — ADM-02 ──
  | 'users.search' // search/view/list users (staff)
  // ── Analytics (SA) ──
  | 'analytics.read'
  // ── System health (SA) — ADM-22 ──
  | 'system.health.read';

/** The permission map: key → roles allowed. */
export const ADMIN_PERMISSIONS: Record<AdminPermissionKey, AdminRole[]> = {
  // Config (SA only)
  'config.flags.read': [AdminRole.SUPER_ADMIN],
  'config.flags.write': [AdminRole.SUPER_ADMIN],
  'config.media-limits.read': [AdminRole.SUPER_ADMIN],
  'config.media-limits.write': [AdminRole.SUPER_ADMIN],
  'config.app-versions.write': [AdminRole.SUPER_ADMIN],
  'config.maintenance.write': [AdminRole.SUPER_ADMIN],
  'config.defaults.read': [AdminRole.SUPER_ADMIN],
  'config.defaults.write': [AdminRole.SUPER_ADMIN],
  'config.otp-channels.write': [AdminRole.SUPER_ADMIN],
  'config.eav.write': [AdminRole.SUPER_ADMIN],

  // Moderation (MOD, SA)
  'moderation.listings.write': [AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN],
  'moderation.users.write': [AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN],
  'moderation.reports.read': [AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN],
  'moderation.reports.write': [AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN],
  'moderation.appeals.read': [AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN],
  'moderation.appeals.write': [AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN],

  // Support (SUP, SA)
  'support.tickets.read': [AdminRole.SUPPORT_AGENT, AdminRole.SUPER_ADMIN],
  'support.tickets.write': [AdminRole.SUPPORT_AGENT, AdminRole.SUPER_ADMIN],
  'support.cv-queue.read': [AdminRole.SUPPORT_AGENT, AdminRole.SUPER_ADMIN],
  'support.cv-queue.write': [AdminRole.SUPPORT_AGENT, AdminRole.SUPER_ADMIN],
  'verification.queue.read': [AdminRole.SUPPORT_AGENT, AdminRole.SUPER_ADMIN],
  'verification.queue.write': [AdminRole.SUPPORT_AGENT, AdminRole.SUPER_ADMIN],

  // Payments (FIN, SA)
  'payments.console.read': [AdminRole.FINANCIAL_AUDITOR, AdminRole.SUPER_ADMIN],
  'payments.console.write': [AdminRole.FINANCIAL_AUDITOR, AdminRole.SUPER_ADMIN],
  'payments.refunds.write': [AdminRole.FINANCIAL_AUDITOR, AdminRole.SUPER_ADMIN],

  // Audit (FIN read-only, SA)
  'audit.read': [AdminRole.FINANCIAL_AUDITOR, AdminRole.SUPER_ADMIN],

  // Admin management (SA only)
  'admin.users.manage': [AdminRole.SUPER_ADMIN],
  'admin.sessions.manage': [AdminRole.SUPER_ADMIN],
  'admin.login-logs.read': [AdminRole.SUPER_ADMIN],

  // User search (SUP, SA)
  'users.search': [AdminRole.SUPPORT_AGENT, AdminRole.SUPER_ADMIN],

  // Analytics (SA)
  'analytics.read': [AdminRole.SUPER_ADMIN],

  // System health (SA)
  'system.health.read': [AdminRole.SUPER_ADMIN],
};

/** Check if a role is permitted to perform an action. */
export function can(role: AdminRole, permission: AdminPermissionKey): boolean {
  return (ADMIN_PERMISSIONS[permission] ?? []).includes(role);
}
