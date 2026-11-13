import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { configuration } from '../../config/configuration';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

/**
 * DevOnlyGuard — blocks dev helper routes (architecture §13 testing conventions)
 *  in production. Dev helpers include /dev/otp, /dev/jobs/run/* and the echo/rate
 *  test routes; they are never available in production.
 */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (configuration.NODE_ENV === 'production') {
      throw AppError.forbidden(ErrorCodes.FORBIDDEN, 'Dev helpers are disabled in production');
    }
    return true;
  }
}
