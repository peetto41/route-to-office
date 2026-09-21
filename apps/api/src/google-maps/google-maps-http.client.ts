import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';

// Applied to every outbound Google Maps Platform call via `AbortSignal.timeout`
// — a prior security review of an earlier integration flagged that a
// `fetch()` call with no timeout lets a hung upstream hang a request handler
// indefinitely. Don't reintroduce that gap here.
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Internal error type used between `GoogleMapsHttpClient` and the
 * routes/geocoding services. Deliberately carries only an `upstreamStatus`
 * (a transport-level HTTP status code, e.g. a 5xx from Google's edge) — never
 * a response body, never the request URL (which, for these two Google APIs,
 * carries the API key in its query string — see this file's class doc
 * comment). Callers must not forward `.message` to the client; wrap this into
 * a public-safe `UpstreamMapsException` instead.
 *
 * Note this only covers *transport*-level failures (network error, non-2xx
 * HTTP status). Google's Directions/Geocoding APIs normally respond `200 OK`
 * even for a logical failure (bad request, quota exceeded, no results) and
 * signal it instead via a `status` field in the JSON body (`ZERO_RESULTS`,
 * `OVER_QUERY_LIMIT`, `REQUEST_DENIED`, `INVALID_REQUEST`, `NOT_FOUND`, ...).
 * That field is inspected by `RoutesService`/`GeocodingService` themselves,
 * not here, since what counts as a normal outcome (e.g. `ZERO_RESULTS` on a
 * geocode) differs by endpoint.
 */
export class GoogleMapsApiError extends Error {
  constructor(public readonly upstreamStatus: number | undefined) {
    super('Google Maps API request failed');
    this.name = 'GoogleMapsApiError';
  }
}

/**
 * The only class in this codebase that reads `GOOGLE_MAPS_SERVER_API_KEY` and
 * attaches it to an outbound request. `RoutesService` and `GeocodingService`
 * both go through this instead of calling `fetch` directly, so there is
 * exactly one place to audit for "does the key ever end up somewhere it
 * shouldn't" and exactly one thing tests need to mock to exercise every
 * Google-Maps-backed code path without a real network call or a real API key.
 *
 * Unlike the previous OpenRouteService integration (which sent its key in an
 * `Authorization` header), Google's classic Directions and Geocoding REST
 * APIs only accept the key as a `key=` query-string parameter — there is no
 * header-based alternative for these two endpoints. That is Google's own API
 * contract, not a choice made here. The mitigation for the "query params tend
 * to end up in logs" risk this raises is: this client never logs the request
 * URL (or anything else) itself, and the key should be restricted in Google
 * Cloud Console to the Directions + Geocoding APIs and, ideally, this
 * server's own IP (see `.env.example`) — unlike ORS, Google's console
 * actually supports that restriction.
 */
@Injectable()
export class GoogleMapsHttpClient {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  private get apiKey(): string {
    return this.configService.get('GOOGLE_MAPS_SERVER_API_KEY', {
      infer: true,
    });
  }

  /**
   * GET with the API key sent as the `key` query parameter, per Google's
   * Directions/Geocoding API contract (see this class's doc comment for why
   * there's no header alternative). Both APIs this module calls are GET-only.
   */
  async getJson<T>(baseUrl: string, query: Record<string, string>): Promise<T> {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('key', this.apiKey);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new GoogleMapsApiError(undefined);
    }
    if (!response.ok) {
      throw new GoogleMapsApiError(response.status);
    }
    return (await response.json()) as T;
  }
}
