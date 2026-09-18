import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import {
  GeocodeNotFoundException,
  UpstreamMapsException,
} from '../common/exceptions/upstream-maps.exception';
import { OrsApiError, OrsHttpClient } from './ors-http.client';

const GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search';

// `POST /api/v1/route`'s own address branch auto-picks the single top
// candidate (no picker UI in front of it); `GET /api/v1/geocode` returns up
// to this many candidates for the frontend's picker instead. See
// references/openrouteservice-api.md's "Geocoding" section.
const SINGLE_RESULT_SIZE = '1';
const MULTI_RESULT_SIZE = '5';

// `boundary.country` (the outgoing request filter) takes the ISO 3166-1
// alpha-2 code ORS documents. `properties.country_a` (the field actually
// present on every feature in a real ORS/Pelias response, confirmed live
// 2026-09) is alpha-3 instead — Pelias does not return an alpha-2
// `country_code` property at all, despite that being this app's original
// assumption; see references/openrouteservice-api.md's "Geocoding" section
// for the correction. Don't conflate the two codes/lengths.
const THAILAND_COUNTRY_CODE_ALPHA2 = 'TH';
const THAILAND_COUNTRY_CODE_ALPHA3 = 'THA';

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface GeocodingApiFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { label?: string; country_a?: string };
}

interface GeocodingApiResponse {
  features?: GeocodingApiFeature[];
}

/**
 * Wraps ORS's Pelias-based Geocoding. See references/openrouteservice-api.md.
 *
 * Always scopes results to Thailand (`boundary.country=TH`) and biases
 * ranking toward the company's own coordinates (`focus.point.lon/lat`) —
 * without these, Pelias ranks matches globally and an English-language query
 * like "Siam Paragon" can resolve to a similarly-named place outside
 * Thailand instead of Bangkok. This was a live bug; see
 * references/openrouteservice-api.md's "Geocoding" section.
 *
 * On top of that upstream filter, every response is defensively re-filtered
 * server-side to `properties.country_code === 'TH'` before being mapped —
 * this app's Thailand-only contract shouldn't depend entirely on a third
 * party's filter behaving as documented.
 */
@Injectable()
export class GeocodingService {
  constructor(
    private readonly httpClient: OrsHttpClient,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * Used by `POST /api/v1/route`'s address branch: auto-picks the single top
   * (Thailand-scoped) candidate. An empty result set is a normal "not found"
   * outcome, surfaced as `GeocodeNotFoundException`, not a 500.
   */
  async geocode(address: string): Promise<GeocodeResult> {
    const features = await this.search(address, SINGLE_RESULT_SIZE);
    const feature = features[0];
    if (!feature) {
      throw new GeocodeNotFoundException();
    }

    const result = this.toGeocodeResult(feature, address);
    if (!result) {
      throw new UpstreamMapsException(
        'The mapping service could not resolve that address.',
      );
    }
    return result;
  }

  /**
   * Used by `GET /api/v1/geocode`: returns every (Thailand-scoped) candidate
   * ORS returns, up to `MULTI_RESULT_SIZE`, for the frontend's picker. An
   * empty array is a normal "not found" result, not an error — callers
   * should surface it as such, never throw.
   */
  async geocodeMultiple(address: string): Promise<GeocodeResult[]> {
    const features = await this.search(address, MULTI_RESULT_SIZE);
    const results: GeocodeResult[] = [];
    for (const feature of features) {
      const result = this.toGeocodeResult(feature, address);
      if (result) {
        results.push(result);
      }
    }
    return results;
  }

  /**
   * Calls ORS Geocoding with the required country scoping/bias and returns
   * the response's `features`, already defensively re-filtered to
   * `properties.country_code === 'TH'`. Shared by both `geocode` (size=1)
   * and `geocodeMultiple` (size=5) so the request shape and the defensive
   * filter live in exactly one place.
   */
  private async search(
    address: string,
    size: string,
  ): Promise<GeocodingApiFeature[]> {
    const companyLat = this.configService.get('COMPANY_LAT', { infer: true });
    const companyLng = this.configService.get('COMPANY_LNG', { infer: true });

    let response: GeocodingApiResponse;
    try {
      response = await this.httpClient.getJson<GeocodingApiResponse>(
        GEOCODE_URL,
        {
          text: address,
          size,
          'boundary.country': THAILAND_COUNTRY_CODE_ALPHA2,
          'focus.point.lon': String(companyLng),
          'focus.point.lat': String(companyLat),
        },
      );
    } catch (error) {
      if (error instanceof OrsApiError) {
        throw new UpstreamMapsException();
      }
      throw error;
    }

    // Defensive re-filter: don't trust ORS's boundary.country filter alone —
    // see references/openrouteservice-api.md's "Geocoding" section. Note
    // `country_a`, not `country_code` — see this file's constant comment.
    return (response.features ?? []).filter(
      (feature) =>
        feature.properties?.country_a === THAILAND_COUNTRY_CODE_ALPHA3,
    );
  }

  private toGeocodeResult(
    feature: GeocodingApiFeature,
    fallbackAddress: string,
  ): GeocodeResult | undefined {
    // ORS coordinates are [lon, lat] — the reverse of this app's own
    // { lat, lng } DTOs. Convert explicitly here.
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) {
      return undefined;
    }

    return {
      lat: coordinates[1],
      lng: coordinates[0],
      formattedAddress: feature.properties?.label ?? fallbackAddress,
    };
  }
}
