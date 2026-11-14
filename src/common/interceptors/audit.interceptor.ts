import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  Logger,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { tap, type Observable } from 'rxjs';
import { AUDIT_KEY, type AuditMetadata } from '../decorators/audit.decorator';
import { AuditActorType } from '../../modules/platform/audit/audit.constants';

/**
 * AuditInterceptor — when a handler is decorated with @Audit({ action, entity }),
 * this interceptor records an AuditLog entry after the handler succeeds.
 *
 * The `actorId` is read from req.admin (bootstrap guard) or req.user (JWT guard,
 * Phase 3+). The `entityId` is taken from req.params.id or req.params.key.
 * `before` is not captured here — routes that need before/after both should use
 * explicit AuditService.record() calls (as the flag and defaults PATCHes do).
 *
 * This interceptor is registered as an APP_INTERCEPTOR in AppModule and is a
 * no-op on routes without @Audit.
 *
 * NOTE: explicit record() calls produce richer before/after payloads and are
 * preferred for modifying routes. @Audit is intended for simpler write routes
 * (e.g. admin user management actions added in later phases) where the response
 * body is a sufficient after snapshot.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<any>();
    const actorId: string =
      (req.admin as { id?: string } | undefined)?.id ??
      (req.user as { id?: string } | undefined)?.id ??
      'unknown';
    const entityId: string =
      req.params?.id ?? req.params?.key ?? req.body?.key ?? 'unknown';

    return next.handle().pipe(
      tap({
        next: (payload) => {
          this.recordAsync(meta, actorId, entityId, payload).catch((err) =>
            this.logger.error(`AuditInterceptor failed: ${(err as Error).message}`),
          );
        },
      }),
    );
  }

  private async recordAsync(
    meta: AuditMetadata,
    actorId: string,
    entityId: string,
    after: unknown,
  ): Promise<void> {
    const { AuditService } = await import('../../modules/platform/audit/audit.service');
    const svc = this.moduleRef.get<InstanceType<typeof AuditService>>(AuditService, {
      strict: false,
    });
    await svc.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: meta.action,
      entity: meta.entity,
      entityId,
      after,
    });
  }
}
