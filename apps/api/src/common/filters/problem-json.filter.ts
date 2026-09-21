import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ProblemJson {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}

/**
 * Global exception filter: every thrown error becomes an
 * `application/problem+json` (RFC 7807) body.
 *
 * Security-critical invariant: this is the last line of defence against a
 * secret (the Google Maps server API key) or an upstream Google Maps error
 * body leaking to the client. For anything that isn't one of *our own*
 * `HttpException`s (i.e. an exception we deliberately threw with a safe,
 * static message), the detail is a hard-coded generic string — never
 * `exception.message`, never `exception.stack`, never the upstream response
 * body. `UpstreamMapsException` and `GeocodeNotFoundException` are the only
 * exceptions from the google-maps module that reach here, and both already
 * carry only safe, static text (see
 * `common/exceptions/upstream-maps.exception.ts`).
 */
@Catch()
export class ProblemJsonFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemJsonFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, title, detail } = this.toProblem(exception);
    // The path only — never the query string. A GET request can carry a
    // user-typed address as a query param (e.g. `/geocode?address=...`),
    // which is personal data under the PDPA note in SKILL.md; neither the
    // server log line below nor the `instance` field in the response body
    // should echo it back.
    const path = request.path;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Log the exception name/status/path only — never the message,
      // stack, or query string, since any of those could (in a bug
      // scenario) end up containing request data such as user-typed
      // addresses or coordinates (PDPA) or an upstream error body.
      this.logger.error(
        `Unhandled exception (${status}) on ${request.method} ${path}`,
      );
    }

    const body: ProblemJson = {
      type: 'about:blank',
      title,
      status,
      detail,
      instance: path,
    };

    response.status(status).type('application/problem+json').json(body);
  }

  private toProblem(exception: unknown): {
    status: HttpStatus;
    title: string;
    detail: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const detail = this.extractDetail(response, exception.message);
      return { status, title: HttpStatus[status] ?? exception.name, detail };
    }

    // Unknown/unexpected error: never surface exception.message or .stack.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred.',
    };
  }

  private extractDetail(response: unknown, fallback: string): string {
    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object' && 'message' in response) {
      const message = response.message;
      if (Array.isArray(message)) {
        return message.map(String).join('; ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    return fallback;
  }
}
