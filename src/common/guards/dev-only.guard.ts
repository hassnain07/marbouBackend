import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { configuration } from '../../config/configuration';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

/**
 * DevOnlyGuard — blocks dev helper routes (architecture §13 testing conventions)
 * in production AND staging. Dev helpers include /dev/otp, /dev/jobs/run/* and the
 * echo/rate test routes; they are only available in development and test.
 */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    const env = configuration.NODE_ENV;
    if (env === 'production' || env === 'staging') {
      throw AppError.forbidden(ErrorCodes.FORBIDDEN, 'Dev helpers are disabled in production and staging');
    }
    return true;
  }
}
