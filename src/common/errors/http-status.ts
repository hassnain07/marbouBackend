/** HTTP status codes used across the API. The status carries the class of an
 *  error; the machine `code` carries the specifics (architecture §5.2). */
export const HttpStatus = {
  OK: 200,
  NOT_MODIFIED: 304,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type HttpStatusValue = (typeof HttpStatus)[keyof typeof HttpStatus];
