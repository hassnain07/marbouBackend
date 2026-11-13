import { z } from 'zod';
import { ZodValidationPipe, zodPipe } from './zod-validation.pipe';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

describe('ZodValidationPipe', () => {
  const schema = z.object({ name: z.string().min(1), age: z.number().int().positive() });
  const pipe = new ZodValidationPipe(schema);
  const meta = {} as any;

  it('passes valid input through unchanged', () => {
    const result = pipe.transform({ name: 'Ahmed', age: 30 }, meta);
    expect(result).toEqual({ name: 'Ahmed', age: 30 });
  });

  it('throws AppError VALIDATION_FAILED with details on invalid input', () => {
    expect(() => pipe.transform({ name: '', age: -1 }, meta)).toThrow(AppError);
    try {
      pipe.transform({ name: '' }, meta);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(e.status).toBe(422);
      expect(e.details.length).toBeGreaterThan(0);
    }
  });

  it('zodPipe returns a ZodValidationPipe instance', () => {
    const p = zodPipe(z.string());
    expect(p).toBeInstanceOf(ZodValidationPipe);
  });

  it('coerces types according to the schema', () => {
    const numPipe = zodPipe(z.coerce.number());
    expect(numPipe.transform('42', meta)).toBe(42);
  });
});
