import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { REQUIRES_FLAG_KEY } from '../decorators/requires-flag.decorator';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

/**
 * FlagGuard — when a route is decorated with @RequiresFlag('key') and that flag
 * is OFF in FeatureFlagsService, respond 404 FEATURE_DISABLED (architecture §5.7).
 *
 * Uses ModuleRef.get with { strict: false } to resolve FeatureFlagsService from
 * the application module graph without directly importing it into common/, keeping
 * the dependency direction clean (common never imports modules/).
 *
 * Registered as an APP_GUARD in AppModule so it runs on every route after
 * RateLimitGuard. Routes without @RequiresFlag pass through immediately.
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

    // Lazily resolve FeatureFlagsService. By the time guards run all modules
    // are fully initialised, so strict:false is safe and no circular dependency
    // is introduced at the type level.
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
