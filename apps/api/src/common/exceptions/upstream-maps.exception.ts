import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown by the google-maps module whenever a call to Google Maps Platform
 * (Directions or Geocoding) fails — a transport-level failure (network
 * error, non-2xx response, timeout) or a logical one signalled via that
 * API's own `status` field (e.g. `OVER_QUERY_LIMIT`, `REQUEST_DENIED`,
 * `INVALID_REQUEST`, or an unroutable `NOT_FOUND`/`ZERO_RESULTS` on
 * Directions).
 *
 * Deliberately carries only a generic, hard-coded detail message — never the
 * upstream error body, request URL (which, for Google's APIs, carries the
 * API key in its query string), or API key. The raw upstream error should be
 * logged server-side (without the API key) by the caller if needed, never
 * attached to this exception's response body.
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
