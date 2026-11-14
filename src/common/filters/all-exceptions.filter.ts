import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus as NestHttpStatus,
  Logger,
} from '@nestjs/common';
import { ZodError } from 'zod';
import type { Response } from 'express';
import { AppError } from '../errors/app-error';
import { ErrorCodes, STATUS_BY_CODE } from '../errors/error-codes';
import { localizeError } from '../i18n/messages';
import { getLocale, getRequestId } from '../request-context';
import type { ErrorEnvelope } from '../envelope';
import { captureError } from '../../integrations/monitoring/sentry';

/**
 * AllExceptionsFilter — converts every thrown error into the structured error
 * envelope (architecture §5.2):
 *   { success: false, error: { code, message, details, traceId } }
 * Messages are localised from the request's resolved locale.
 * 5xx errors are forwarded to Sentry (captureError).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<any>();
    const lang = getLocale(req);
    const traceId = getRequestId(req) ?? undefined;

    const { status, envelope } = this.toEnvelope(exception, lang, traceId);

    if (status >= 500) {
      this.logger.error(
        `Unhandled error: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      captureError(exception);
    }

    if (!res.headersSent) {
      res.status(status).json(envelope);
    }
  }

  private toEnvelope(
    exception: unknown,
    lang: ReturnType<typeof getLocale>,
    traceId?: string,
  ): { status: number; envelope: ErrorEnvelope } {
    if (exception instanceof AppError) {
      const message =
        exception.message && exception.message !== exception.code
          ? exception.message
          : localizeError(exception.code, lang);
      return {
        status: exception.status,
        envelope: {
          success: false,
          error: {
            code: exception.code,
            message,
            details: exception.details.length ? exception.details : undefined,
            traceId,
          },
        },
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: 422,
        envelope: {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_FAILED,
            message: localizeError(ErrorCodes.VALIDATION_FAILED, lang),
            details: exception.issues.map((i) => ({
              field: i.path.join('.') || undefined,
              issue: i.message,
            })),
            traceId,
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const code = this.extractCode(response) ?? this.statusToCode(status);
      const message = this.extractMessage(response, code, lang);
      const details = this.extractDetails(response);
      return {
        status,
        envelope: {
          success: false,
          error: { code, message, details, traceId },
        },
      };
    }

    return {
      status: NestHttpStatus.INTERNAL_SERVER_ERROR,
      envelope: {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          // Surface the actual error message in non-production so e2e tests
          // and developers can diagnose issues without reading server logs.
          message:
            process.env.NODE_ENV !== 'production' && exception instanceof Error
              ? exception.message
              : localizeError(ErrorCodes.INTERNAL_ERROR, lang),
          traceId,
        },
      },
    };
  }

  private extractCode(response: unknown): string | undefined {
    if (typeof response === 'object' && response !== null) {
      const r = response as Record<string, unknown>;
      if (typeof r.code === 'string') return r.code;
    }
    return undefined;
  }

  private extractMessage(
    response: unknown,
    code: string,
    lang: ReturnType<typeof getLocale>,
  ): string {
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && response !== null) {
      const r = response as Record<string, unknown>;
      const raw =
        Array.isArray(r.message) && r.message.length
          ? String(r.message[0])
          : typeof r.message === 'string'
            ? r.message
            : undefined;
      // Nest's default not-found handler produces "Cannot {METHOD} {url}"; localise
      // those defaults. Custom HttpException messages are preserved as-is.
      if (raw && !raw.startsWith('Cannot ')) return raw;
    }
    return localizeError(code, lang);
  }

  private extractDetails(
    response: unknown,
  ): { field?: string; issue: string }[] | undefined {
    if (typeof response === 'object' && response !== null) {
      const r = response as Record<string, unknown>;
      if (Array.isArray(r.details)) return r.details as { field?: string; issue: string }[];
    }
    return undefined;
  }

  private statusToCode(status: number): string {
    switch (status) {
      case 400:
        return ErrorCodes.VALIDATION_FAILED;
      case 401:
        return ErrorCodes.UNAUTHORIZED;
      case 403:
        return ErrorCodes.FORBIDDEN;
      case 404:
        return ErrorCodes.NOT_FOUND;
      case 409:
        return ErrorCodes.CONFLICT; // generic conflict — not idempotency-specific
      case 422:
        return ErrorCodes.VALIDATION_FAILED;
      case 429:
        return ErrorCodes.RATE_LIMITED;
      default:
        return ErrorCodes.INTERNAL_ERROR;
    }
  }
}

export { STATUS_BY_CODE };
