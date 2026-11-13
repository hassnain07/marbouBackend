import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { HttpException, NotFoundException } from '@nestjs/common';

function makeHost(lang = 'en'): any {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json, headersSent: false };
  const req = { locale: lang, requestId: 'test-trace' };
  return {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
    }),
    _res: res,
  };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('formats an AppError with correct code and localised message', () => {
    const host = makeHost('en');
    filter.catch(new AppError(ErrorCodes.NOT_FOUND, 404), host);
    const [statusCode] = host._res.status.mock.calls[0];
    const [body] = host._res.json.mock.calls[0];
    expect(statusCode).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(body.error.message).toBe('Resource not found');
  });

  it('formats an AppError in Arabic', () => {
    const host = makeHost('ar');
    filter.catch(new AppError(ErrorCodes.NOT_FOUND, 404), host);
    const [body] = host._res.json.mock.calls[0];
    expect(body.error.message).toBe('المورد غير موجود');
  });

  it('formats a ZodError as VALIDATION_FAILED 422 with details', () => {
    const host = makeHost('en');
    const { z } = require('zod');
    const result = z.object({ x: z.number() }).safeParse({ x: 'oops' });
    filter.catch((result as any).error, host);
    const [statusCode] = host._res.status.mock.calls[0];
    const [body] = host._res.json.mock.calls[0];
    expect(statusCode).toBe(422);
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('formats a Nest NotFoundException with NOT_FOUND 404', () => {
    const host = makeHost('en');
    filter.catch(new NotFoundException(), host);
    const [statusCode] = host._res.status.mock.calls[0];
    const [body] = host._res.json.mock.calls[0];
    expect(statusCode).toBe(404);
    expect(body.error.code).toBe(ErrorCodes.NOT_FOUND);
  });

  it('maps generic 409 HttpException to CONFLICT', () => {
    const host = makeHost('en');
    filter.catch(new HttpException('conflict', 409), host);
    const [body] = host._res.json.mock.calls[0];
    expect(body.error.code).toBe(ErrorCodes.CONFLICT);
  });

  it('maps unknown exceptions to 500 INTERNAL_ERROR', () => {
    const host = makeHost('en');
    filter.catch(new Error('boom'), host);
    const [statusCode] = host._res.status.mock.calls[0];
    expect(statusCode).toBe(500);
    const [body] = host._res.json.mock.calls[0];
    expect(body.error.code).toBe(ErrorCodes.INTERNAL_ERROR);
  });

  it('attaches a traceId from the request', () => {
    const host = makeHost('en');
    filter.catch(new AppError(ErrorCodes.NOT_FOUND, 404), host);
    const [body] = host._res.json.mock.calls[0];
    expect(body.error.traceId).toBe('test-trace');
  });

  it('localises "Cannot GET /" to the standard NOT_FOUND message', () => {
    const host = makeHost('en');
    filter.catch(new NotFoundException('Cannot GET /nonexistent'), host);
    const [body] = host._res.json.mock.calls[0];
    expect(body.error.message).toBe('Resource not found');
  });
});
