import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';

// Applied to every outbound OpenRouteService call via `AbortSignal.timeout` —
// a prior security review of the old Google integration flagged that none of
// its `fetch()` calls had a timeout, so a hung upstream could hang a request
// indefinitely. Don't reintroduce that gap here.
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Internal error type used between `OrsHttpClient` and the
 * routes/geocoding services. Deliberately carries only an `upstreamStatus`
 * (an HTTP status code) — never a response body, never the request URL.
 * Callers must not forward `.message` to the client; wrap this into a
 * public-safe `UpstreamMapsException` instead.
 */
export class OrsApiError extends Error {
  constructor(public readonly upstreamStatus: number | undefined) {
    super('OpenRouteService request failed');
    this.name = 'OrsApiError';
  }
}

/**
 * The only class in this codebase that reads `ORS_API_KEY` and attaches it
 * to an outbound request. `RoutesService` and `GeocodingService` both go
 * through this instead of calling `fetch` directly, so there is exactly one
 * place to audit for "does the key ever end up somewhere it shouldn't" and
 * exactly one thing tests need to mock to exercise every ORS-backed code
 * path without a real network call or a real API key.
 */
@Injectable()
export class OrsHttpClient {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  private get apiKey(): string {
    return this.configService.get('ORS_API_KEY', { infer: true });
  }

  /**
   * ORS's documented convention is the raw key in the `Authorization` header
   * with no `Bearer` prefix (see
   * references/openrouteservice-api.md's "Authentication" section) — that
   * read couldn't be 100% confirmed against the (JS-rendered) interactive
   * docs site, so double-check it against your own ORS dashboard's
   * quick-start snippet once you have a real key. Kept as its own method so
   * switching to `Bearer <key>` (or anything else) is a one-line change.
   */
  private authHeader(): string {
    return this.apiKey;
  }

  /** POST with the API key sent as an `Authorization` header. */
  async postJson<T>(url: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new OrsApiError(undefined);
    }
    if (!response.ok) {
      throw new OrsApiError(response.status);
    }
    return (await response.json()) as T;
  }

  /**
   * GET with the API key sent as an `Authorization` header and everything
   * else as query parameters (used by ORS Geocoding). Deliberately does not
   * fall back to the `api_key=...` query-string alternative ORS also
   * supports — a query param is far more likely to end up copied into a log
   * line somewhere (access logs, proxies).
   */
  async getJson<T>(baseUrl: string, query: Record<string, string>): Promise<T> {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { Authorization: this.authHeader() },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new OrsApiError(undefined);
    }
    if (!response.ok) {
      throw new OrsApiError(response.status);
    }
    return (await response.json()) as T;
  }
}
