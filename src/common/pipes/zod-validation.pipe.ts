import {
  type ArgumentMetadata,
  type PipeTransform,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

/**
 * ZodValidationPipe — the single validation entry point (architecture §2, §5.2).
 * The same Zod rules the clients compile from schema JSON are enforced here, so
 * client and server share validation (CAT-08). On failure it throws an AppError
 * with `VALIDATION_FAILED` and a `details[]` array of {field, issue}.
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        issue: issue.message,
      }));
      throw new AppError(ErrorCodes.VALIDATION_FAILED, 422, { details });
    }
    return result.data;
  }
}

/** Convenience: builds a pipe bound to a schema. */
export function zodPipe<T extends z.ZodTypeAny>(schema: T): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}

/** Thrown when an unknown route param cannot be parsed — kept as a Nest
 *  exception so the framework maps it through the global filter. */
export class ZodParamException extends BadRequestException {}
