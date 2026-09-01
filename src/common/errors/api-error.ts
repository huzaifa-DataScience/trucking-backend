import { HttpException, HttpStatus } from '@nestjs/common';

/** Stable codes for frontend toasts / i18n. Prefer `code` over parsing `message`. */
export const ApiErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  DB_UNAVAILABLE: 'DB_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Specs / bidding
  SPECS_BID_NOT_FOUND: 'SPECS_BID_NOT_FOUND',
  SPECS_LINE_NOT_FOUND: 'SPECS_LINE_NOT_FOUND',
  SPECS_NO_MIKE_ROWS: 'SPECS_NO_MIKE_ROWS',
  SPECS_MIKE_ROWS_INVALID: 'SPECS_MIKE_ROWS_INVALID',
  SPECS_MIKE_FILE_NOT_FOUND: 'SPECS_MIKE_FILE_NOT_FOUND',
  SPECS_MIKE_FILE_NAME_INVALID: 'SPECS_MIKE_FILE_NAME_INVALID',
  SPECS_JOB_NOT_FOUND: 'SPECS_JOB_NOT_FOUND',
  SPECS_LINE_INVALID: 'SPECS_LINE_INVALID',
  SPECS_CATALOG_NOT_FOUND: 'SPECS_CATALOG_NOT_FOUND',
  SPECS_CATALOG_PRICE_INVALID: 'SPECS_CATALOG_PRICE_INVALID',
  SPECS_TRIMBLE_NOT_LINKED: 'SPECS_TRIMBLE_NOT_LINKED',
  BID_DUPLICATE: 'BID_DUPLICATE',
} as const;

export type ApiErrorCodeName = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export type ApiErrorBody = {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
};

export class ApiException extends HttpException {
  constructor(
    code: ApiErrorCodeName | string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: unknown,
  ) {
    const body: ApiErrorBody = {
      statusCode: status,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    };
    super(body, status);
  }
}

export function apiBadRequest(
  code: ApiErrorCodeName | string,
  message: string,
  details?: unknown,
): ApiException {
  return new ApiException(code, message, HttpStatus.BAD_REQUEST, details);
}

export function apiConflict(
  code: ApiErrorCodeName | string,
  message: string,
  details?: unknown,
): ApiException {
  return new ApiException(code, message, HttpStatus.CONFLICT, details);
}

export function apiNotFound(
  code: ApiErrorCodeName | string,
  message: string,
  details?: unknown,
): ApiException {
  return new ApiException(code, message, HttpStatus.NOT_FOUND, details);
}
