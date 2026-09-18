import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown by the openrouteservice module (or the tile proxy) whenever a call
 * to an upstream mapping service fails (network error, non-2xx response,
 * timeout, malformed payload).
 *
 * Deliberately carries only a generic, hard-coded detail message — never the
 * upstream error body, request URL, or API key. The raw upstream error
 * should be logged server-side (without the API key) by the caller if
 * needed, never attached to this exception's response body.
 */
export class UpstreamMapsException extends HttpException {
  constructor(detail = 'The mapping service is temporarily unavailable.') {
    super(detail, HttpStatus.BAD_GATEWAY);
  }
}

/**
 * A geocoding miss (zero results / ambiguous match) is a normal client-facing
 * error, not an upstream failure — surfaced as 404 so the frontend can render
 * "address not found" rather than a generic 502.
 */
export class GeocodeNotFoundException extends HttpException {
  constructor(detail = 'No results found for the given address.') {
    super(detail, HttpStatus.NOT_FOUND);
  }
}
