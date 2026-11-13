import { HttpStatus } from './http-status';

/** A single validation/issue detail attached to an error (envelope §5.2). */
export interface ErrorDetail {
  field?: string;
  issue: string;
}

/**
 * AppError — the canonical in-app exception. Thrown by services/controllers;
 * serialised by AllExceptionsFilter into the structured error envelope:
 *   { success: false, error: { code, message, details, traceId } }
 * The localised message is resolved by the filter from the i18n catalog using
 * `code` unless `message` is explicitly provided.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: ErrorDetail[];
  readonly cause?: unknown;

  constructor(
    code: string,
    status: number = HttpStatus.BAD_REQUEST,
    options: { details?: ErrorDetail[]; message?: string; cause?: unknown } = {},
  ) {
    super(options.message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = options.details ?? [];
    if (options.cause) this.cause = options.cause;
    // Maintain a proper stack trace where supported.
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(code: string, details?: ErrorDetail[], message?: string): AppError {
    return new AppError(code, HttpStatus.BAD_REQUEST, { details, message });
  }
  static unauthorized(code: string, message?: string): AppError {
    return new AppError(code, HttpStatus.UNAUTHORIZED, { message });
  }
  static forbidden(code: string, message?: string): AppError {
    return new AppError(code, HttpStatus.FORBIDDEN, { message });
  }
  static notFound(code: string, message?: string): AppError {
    return new AppError(code, HttpStatus.NOT_FOUND, { message });
  }
  static conflict(code: string, message?: string): AppError {
    return new AppError(code, HttpStatus.CONFLICT, { message });
  }
  static unprocessable(code: string, details?: ErrorDetail[], message?: string): AppError {
    return new AppError(code, HttpStatus.UNPROCESSABLE, { details, message });
  }
  static rateLimited(code: string, message?: string): AppError {
    return new AppError(code, HttpStatus.TOO_MANY_REQUESTS, { message });
  }
  static internal(code: string, message?: string): AppError {
    return new AppError(code, HttpStatus.INTERNAL, { message });
  }
}
