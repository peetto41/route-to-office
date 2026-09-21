import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import {
  GeocodeNotFoundException,
  UpstreamMapsException,
} from '../common/exceptions/upstream-maps.exception';
import {
  GoogleMapsApiError,
  GoogleMapsHttpClient,
} from './google-maps-http.client';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

// `POST /api/v1/route`'s own address branch auto-picks the single top
// candidate (no picker UI in front of it); `GET /api/v1/geocode` returns up
// to this many candidates for the frontend's picker instead — see
// `geocode()`/`geocodeMultiple()` below. Google's Geocoding API has no
// `size`-style request parameter (unlike ORS's Pelias-based search) — it
// just returns every match it finds, so this cap is applied client-side
// after the response comes back, not sent upstream.
const MULTI_RESULT_LIMIT = 5;

const THAILAND_COUNTRY_CODE_ALPHA2 = 'TH';

// Google's Geocoding API has no equivalent of ORS's single-point
// `focus.point.lat/lon` ranking bias — the closest analog is `bounds`, a
// *soft*-bias viewport rectangle ("prefer results inside this box, but don't
// exclude results outside it", unlike the hard `components=country:TH`
// filter below). Center a box roughly the size of the Bangkok metro area
// (and then some) on the company's own coordinates so an in-country,
// same-named match near the office still outranks one on the far side of the
// country — the same problem `focus.point` solved for ORS, see
// references/openrouteservice-api.md's "Geocoding" section for the original
// bug this is guarding against.
const BIAS_BOX_DELTA_DEGREES = 0.5;

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface GeocodingApiAddressComponent {
  short_name?: string;
  types?: string[];
}

interface GeocodingApiResult {
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  address_components?: GeocodingApiAddressComponent[];
}

interface GeocodingApiResponse {
  status?: string;
  results?: GeocodingApiResult[];
}

/**
 * Wraps Google's Geocoding API (`GET /maps/api/geocode/json`).
 *
 * Always scopes results to Thailand (`components=country:TH`, a hard filter)
 * and biases ranking toward the company's own coordinates (`bounds`, a soft
 * bias — see `BIAS_BOX_DELTA_DEGREES` above) — without both, an
 * English-language query like "Siam Paragon" risks resolving to a
 * similarly-named place outside Thailand, or a same-named place elsewhere in
 * Thailand outranking the one near the office. This mirrors a live bug found
 * against the previous OpenRouteService/Pelias integration; see
 * references/openrouteservice-api.md's "Geocoding" section.
 *
 * On top of that upstream filter, every response is defensively re-filtered
 * server-side to the `country` address component's `short_name === 'TH'`
 * before being mapped — this app's Thailand-only contract shouldn't depend
 * entirely on a third party's filter behaving as documented, the same
 * defensive posture the ORS integration used (there, the response's own
 * country field was alpha-3 and needed its own re-derivation; Google's
 * `address_components` conveniently already uses the same alpha-2 code as
 * the outgoing `components=country:TH` filter, but the defensive re-check
 * itself is kept regardless — an upstream filter behaving as documented
 * today is not a guarantee it will tomorrow).
 */
@Injectable()
export class GeocodingService {
  constructor(
    private readonly httpClient: GoogleMapsHttpClient,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * Used by `POST /api/v1/route`'s address branch: auto-picks the single top
   * (Thailand-scoped) candidate. `ZERO_RESULTS` (after the defensive filter)
   * is a normal "not found" outcome, surfaced as `GeocodeNotFoundException`,
   * not a 500.
   */
  async geocode(address: string): Promise<GeocodeResult> {
    const results = await this.search(address);
    const result = results[0];
    if (!result) {
      throw new GeocodeNotFoundException();
    }

    const mapped = this.toGeocodeResult(result, address);
    if (!mapped) {
      throw new UpstreamMapsException(
        'The mapping service could not resolve that address.',
      );
    }
    return mapped;
  }

  /**
   * Used by `GET /api/v1/geocode`: returns up to `MULTI_RESULT_LIMIT`
   * (Thailand-scoped) candidates for the frontend's picker. An empty array is
   * a normal "not found" result, not an error — callers should surface it as
   * such, never throw.
   */
  async geocodeMultiple(address: string): Promise<GeocodeResult[]> {
    const results = await this.search(address);
    const mapped: GeocodeResult[] = [];
    for (const result of results) {
      const geocodeResult = this.toGeocodeResult(result, address);
      if (geocodeResult) {
        mapped.push(geocodeResult);
      }
      if (mapped.length >= MULTI_RESULT_LIMIT) {
        break;
      }
    }
    return mapped;
  }

  /**
   * Calls Google's Geocoding API with the required country scoping/bias and
   * returns the response's `results`, already defensively re-filtered to
   * Thailand. Shared by both `geocode` and `geocodeMultiple` so the request
   * shape and the defensive filter live in exactly one place.
   */
  private async search(address: string): Promise<GeocodingApiResult[]> {
    const companyLat = this.configService.get('COMPANY_LAT', { infer: true });
    const companyLng = this.configService.get('COMPANY_LNG', { infer: true });

    let response: GeocodingApiResponse;
    try {
      response = await this.httpClient.getJson<GeocodingApiResponse>(
        GEOCODE_URL,
        {
          address,
          components: `country:${THAILAND_COUNTRY_CODE_ALPHA2}`,
          bounds: biasBounds(companyLat, companyLng),
        },
      );
    } catch (error) {
      if (error instanceof GoogleMapsApiError) {
        throw new UpstreamMapsException();
      }
      throw error;
    }

    // `ZERO_RESULTS` is a normal "not found" outcome (see class doc comment),
    // not an upstream failure — let the caller's empty-array/`geocode()`
    // not-found handling take it from here rather than throwing.
    if (response.status === 'ZERO_RESULTS') {
      return [];
    }
    if (response.status !== 'OK') {
      throw new UpstreamMapsException();
    }

    // Defensive re-filter: don't trust Google's `components=country:TH`
    // filter alone — see this file's class doc comment.
    return (response.results ?? []).filter((result) =>
      (result.address_components ?? []).some(
        (component) =>
          component.types?.includes('country') &&
          component.short_name === THAILAND_COUNTRY_CODE_ALPHA2,
      ),
    );
  }

  private toGeocodeResult(
    result: GeocodingApiResult,
    fallbackAddress: string,
  ): GeocodeResult | undefined {
    // Unlike ORS's GeoJSON-shaped `[lon, lat]` coordinates, Google's
    // Geocoding API already returns a `{ lat, lng }` object — no
    // boundary reversal needed here.
    const location = result.geometry?.location;
    if (
      typeof location?.lat !== 'number' ||
      typeof location?.lng !== 'number'
    ) {
      return undefined;
    }

    return {
      lat: location.lat,
      lng: location.lng,
      formattedAddress: result.formatted_address ?? fallbackAddress,
    };
  }
}

function biasBounds(companyLat: number, companyLng: number): string {
  const southWest = `${companyLat - BIAS_BOX_DELTA_DEGREES},${
    companyLng - BIAS_BOX_DELTA_DEGREES
  }`;
  const northEast = `${companyLat + BIAS_BOX_DELTA_DEGREES},${
    companyLng + BIAS_BOX_DELTA_DEGREES
  }`;
  return `${southWest}|${northEast}`;
}
