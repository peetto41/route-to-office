import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import {
  GeocodeNotFoundException,
  UpstreamMapsException,
} from '../common/exceptions/upstream-maps.exception';
import { OrsApiError, OrsHttpClient } from './ors-http.client';

const GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search';

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface GeocodingApiResponse {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: { label?: string };
  }>;
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
 */
@Injectable()
export class GeocodingService {
  constructor(
    private readonly httpClient: OrsHttpClient,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async geocode(address: string): Promise<GeocodeResult> {
    const companyLat = this.configService.get('COMPANY_LAT', { infer: true });
    const companyLng = this.configService.get('COMPANY_LNG', { infer: true });

    let response: GeocodingApiResponse;
    try {
      response = await this.httpClient.getJson<GeocodingApiResponse>(
        GEOCODE_URL,
        {
          text: address,
          size: '1',
          'boundary.country': 'TH',
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

    // An empty `features` array is a normal "not found" result, not an
    // error — see references/backend-nestjs.md's "Geocoding" section.
    const feature = response.features?.[0];
    if (!feature) {
      throw new GeocodeNotFoundException();
    }

    // ORS coordinates are [lon, lat] — the reverse of this app's own
    // { lat, lng } DTOs. Convert explicitly here.
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) {
      throw new UpstreamMapsException(
        'The mapping service could not resolve that address.',
      );
    }

    return {
      lat: coordinates[1],
      lng: coordinates[0],
      formattedAddress: feature.properties?.label ?? address,
    };
  }
}
