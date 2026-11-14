import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { REQUIRES_FLAG_KEY } from '../decorators/requires-flag.decorator';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

/**
 * FlagGuard — when a route is decorated with @RequiresFlag('key') and that flag
 * is OFF in FeatureFlagsService, respond 404 FEATURE_DISABLED (architecture §5.7).
 *
 * Uses ModuleRef.get with { strict: false } to avoid importing FeatureFlagsService
 * directly into common/, keeping the dependency direction clean.
 */
@Injectable()
export class FlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flagKey = this.reflector.get<string | undefined>(
      REQUIRES_FLAG_KEY,
      context.getHandler(),
    );
    if (!flagKey) return true;

    // Lazily resolve FeatureFlagsService from the module graph. This breaks
    // the potential circular dependency while still being type-safe at runtime.
    const { FeatureFlagsService } = await import(
      '../../modules/platform/feature-flags/feature-flags.service'
    );
    const svc = this.moduleRef.get<InstanceType<typeof FeatureFlagsService>>(FeatureFlagsService, {
      strict: false,
    });

    const enabled = await svc.isEnabled(flagKey);
    if (!enabled) {
      throw AppError.notFound(ErrorCodes.FEATURE_DISABLED);
    }
    return true;
  }
}
