import { SetMetadata } from '@nestjs/common';

export interface AuditMetadata {
  action: string;
  entity: string;
}

export const AUDIT_KEY = 'audit';
/**
 * @Audit({ action: 'flag.patch', entity: 'FeatureFlag' }) — marks a handler
 * for automatic audit logging via AuditInterceptor. The interceptor records an
 * AuditLog entry after the handler succeeds, with the response body as `after`
 * and no `before` (use explicit AuditService.record() when before/after both
 * matter, as in the flag and defaults PATCH routes).
 */
export const Audit = (meta: AuditMetadata) => SetMetadata(AUDIT_KEY, meta);
