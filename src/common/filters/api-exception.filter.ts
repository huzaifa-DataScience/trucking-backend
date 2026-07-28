import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorBody, ApiErrorCode } from '../errors/api-error';

/**
 * Normalizes every error to:
 * `{ statusCode, code, message, details? }` for frontend toasts.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${body.code}: ${this.rawMessage(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof HttpException) {
      return this.fromHttp(exception);
    }
    return this.fromUnknown(exception);
  }

  private fromHttp(exception: HttpException): ApiErrorBody {
    const status = exception.getStatus();
    const raw = exception.getResponse();

    if (typeof raw === 'object' && raw !== null && 'code' in raw && 'message' in raw) {
      const o = raw as Record<string, unknown>;
      return {
        statusCode: typeof o.statusCode === 'number' ? o.statusCode : status,
        code: String(o.code),
        message: this.asMessage(o.message),
        ...(o.details !== undefined ? { details: o.details } : {}),
      };
    }

    // Nest ValidationPipe: { statusCode, message: string[], error: 'Bad Request' }
    if (typeof raw === 'object' && raw !== null) {
      const o = raw as Record<string, unknown>;
      const msg = o.message;
      if (Array.isArray(msg)) {
        return {
          statusCode: status,
          code: ApiErrorCode.VALIDATION_FAILED,
          message: 'Please fix the highlighted fields and try again.',
          details: { fields: msg },
        };
      }
      if (typeof msg === 'string' && msg.trim()) {
        return {
          statusCode: status,
          code: this.codeForStatus(status),
          message: msg,
        };
      }
    }

    if (typeof raw === 'string' && raw.trim()) {
      return { statusCode: status, code: this.codeForStatus(status), message: raw };
    }

    return {
      statusCode: status,
      code: this.codeForStatus(status),
      message: exception.message || this.defaultMessage(status),
    };
  }

  private fromUnknown(exception: unknown): ApiErrorBody {
    const msg = this.rawMessage(exception).toLowerCase();

    if (
      msg.includes('login failed') ||
      msg.includes('connectionerror') ||
      msg.includes('connection is closed') ||
      msg.includes('econnrefused') ||
      msg.includes('etimeout') ||
      msg.includes('operation timed out') ||
      msg.includes('failed to cancel request')
    ) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: ApiErrorCode.DB_UNAVAILABLE,
        message:
          'Database is temporarily unavailable. Please wait a moment and try again.',
      };
    }

    if (msg.includes('unique') || msg.includes('duplicate key')) {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: ApiErrorCode.CONFLICT,
        message: 'This record already exists or conflicts with existing data.',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong. Please try again.',
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ApiErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ApiErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ApiErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ApiErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ApiErrorCode.CONFLICT;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ApiErrorCode.PAYLOAD_TOO_LARGE;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ApiErrorCode.DB_UNAVAILABLE;
      default:
        return status >= 500 ? ApiErrorCode.INTERNAL_ERROR : ApiErrorCode.BAD_REQUEST;
    }
  }

  private defaultMessage(status: number): string {
    if (status === 401) return 'Please sign in again.';
    if (status === 403) return 'You do not have permission for this action.';
    if (status === 404) return 'The requested item was not found.';
    if (status >= 500) return 'Something went wrong. Please try again.';
    return 'Request could not be completed.';
  }

  private asMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join('; ');
    return 'Request could not be completed.';
  }

  private rawMessage(exception: unknown): string {
    if (exception instanceof Error) return exception.message || exception.name;
    return String(exception ?? '');
  }
}
