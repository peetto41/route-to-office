import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import {
  GeocodeNotFoundException,
  UpstreamMapsException,
} from '../common/exceptions/upstream-maps.exception';
import { GeocodingService } from './geocoding.service';
import { OrsApiError, OrsHttpClient } from './ors-http.client';

/**
 * Regression test for a live bug: an English-language query like "Siam
 * Paragon" resolved to a similarly-named place in Taiwan instead of Bangkok
 * because the outgoing ORS geocode request carried no country/location bias.
 * See references/openrouteservice-api.md's "Geocoding" section — this test
 * asserts the *request shape* itself, not just the response mapping, since
 * that's exactly what let the bug slip through originally.
 */
describe('GeocodingService', () => {
  function buildService(getJson: jest.Mock) {
    const httpClient = {
      getJson,
      postJson: jest.fn(),
    } as unknown as OrsHttpClient;
    const configService = {
      get: jest.fn((key: keyof EnvironmentVariables) => {
        if (key === 'COMPANY_LAT') return 13.7469;
        if (key === 'COMPANY_LNG') return 100.539;
        throw new Error(`unexpected config key requested in test: ${key}`);
      }),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    return new GeocodingService(httpClient, configService);
  }

  describe("geocode() — POST /route's address branch (size=1, single top result)", () => {
    it('always sends boundary.country=TH, focus.point from the company coordinates, and size=1', async () => {
      const getJson = jest.fn().mockResolvedValue({
        features: [
          {
            geometry: { coordinates: [100.5018, 13.7563] },
            properties: {
              label: 'Siam Paragon, Bangkok, Thailand',
              country_a: 'THA',
            },
          },
        ],
      });
      const service = buildService(getJson);

      await service.geocode('Siam Paragon');

      expect(getJson).toHaveBeenCalledTimes(1);
      const [url, query] = getJson.mock.calls[0];
      expect(url).toBe('https://api.openrouteservice.org/geocode/search');
      expect(query).toMatchObject({
        text: 'Siam Paragon',
        size: '1',
        'boundary.country': 'TH',
        'focus.point.lon': '100.539',
        'focus.point.lat': '13.7469',
      });
    });

    /**
     * Response-side counterpart to the request-shape test above: ORS returns
     * `geometry.coordinates` as `[lon, lat]`, the reverse of this app's own
     * `{ lat, lng }` shape. Getting this backwards produces a wrong-continent
     * result, not an error (references/openrouteservice-api.md's "Geocoding"
     * section) — this is a regression test for that conversion specifically,
     * not just the request bias fields.
     */
    it('converts the response geometry.coordinates [lon, lat] into { lat, lng }, not swapped', async () => {
      const getJson = jest.fn().mockResolvedValue({
        features: [
          {
            // lon=100.5018, lat=13.7563 (Siam Paragon, Bangkok)
            geometry: { coordinates: [100.5018, 13.7563] },
            properties: {
              label: 'Siam Paragon, Bangkok, Thailand',
              country_a: 'THA',
            },
          },
        ],
      });
      const service = buildService(getJson);

      const result = await service.geocode('Siam Paragon');

      expect(result).toEqual({
        lat: 13.7563,
        lng: 100.5018,
        formattedAddress: 'Siam Paragon, Bangkok, Thailand',
      });
    });

    it('treats an empty features array as a normal "not found" result, not an error', async () => {
      const getJson = jest.fn().mockResolvedValue({ features: [] });
      const service = buildService(getJson);

      await expect(
        service.geocode('a place that does not exist'),
      ).rejects.toBeInstanceOf(GeocodeNotFoundException);
    });

    it('wraps an OrsApiError into a generic UpstreamMapsException', async () => {
      const getJson = jest.fn().mockRejectedValue(new OrsApiError(502));
      const service = buildService(getJson);

      await expect(service.geocode('Siam Paragon')).rejects.toBeInstanceOf(
        UpstreamMapsException,
      );
    });

    it('only ever considers a single top result, even if the upstream response somehow carries more than one feature', async () => {
      const getJson = jest.fn().mockResolvedValue({
        features: [
          {
            geometry: { coordinates: [100.5018, 13.7563] },
            properties: {
              label: 'Central World, Bangkok, Thailand',
              country_a: 'THA',
            },
          },
          {
            geometry: { coordinates: [100.6, 13.8] },
            properties: {
              label: 'Some other Central World-ish place, Thailand',
              country_a: 'THA',
            },
          },
        ],
      });
      const service = buildService(getJson);

      const result = await service.geocode('Central World');

      expect(result).toEqual({
        lat: 13.7563,
        lng: 100.5018,
        formattedAddress: 'Central World, Bangkok, Thailand',
      });
    });
  });

  describe('geocodeMultiple() — GET /api/v1/geocode (size=5, up to 5 candidates)', () => {
    it('sends size=5 alongside the existing boundary.country=TH and focus.point params', async () => {
      const getJson = jest.fn().mockResolvedValue({ features: [] });
      const service = buildService(getJson);

      await service.geocodeMultiple('Central World');

      expect(getJson).toHaveBeenCalledTimes(1);
      const [url, query] = getJson.mock.calls[0];
      expect(url).toBe('https://api.openrouteservice.org/geocode/search');
      expect(query).toMatchObject({
        text: 'Central World',
        size: '5',
        'boundary.country': 'TH',
        'focus.point.lon': '100.539',
        'focus.point.lat': '13.7469',
      });
    });

    it('maps every element of features[], not just the first, into { lat, lng, formattedAddress }', async () => {
      const getJson = jest.fn().mockResolvedValue({
        features: [
          {
            geometry: { coordinates: [100.5018, 13.7563] },
            properties: {
              label: 'Central World, Ratchaprasong, Bangkok',
              country_a: 'THA',
            },
          },
          {
            geometry: { coordinates: [100.55, 13.75] },
            properties: {
              label: 'Central World Tower, Bangkok',
              country_a: 'THA',
            },
          },
          {
            geometry: { coordinates: [100.6, 13.9] },
            properties: {
              label: 'Central World Soi 4, Bangkok',
              country_a: 'THA',
            },
          },
        ],
      });
      const service = buildService(getJson);

      const results = await service.geocodeMultiple('Central World');

      expect(results).toEqual([
        {
          lat: 13.7563,
          lng: 100.5018,
          formattedAddress: 'Central World, Ratchaprasong, Bangkok',
        },
        {
          lat: 13.75,
          lng: 100.55,
          formattedAddress: 'Central World Tower, Bangkok',
        },
        {
          lat: 13.9,
          lng: 100.6,
          formattedAddress: 'Central World Soi 4, Bangkok',
        },
      ]);
    });

    it('defensively excludes a non-TH result even if one somehow appears in the response, despite boundary.country=TH', async () => {
      const getJson = jest.fn().mockResolvedValue({
        features: [
          {
            geometry: { coordinates: [100.5018, 13.7563] },
            properties: {
              label: 'Central World, Bangkok, Thailand',
              country_a: 'THA',
            },
          },
          {
            // A same-named place that slipped through upstream's own country
            // filter — exactly the scenario the defensive re-filter guards
            // against (references/openrouteservice-api.md's "Geocoding"
            // section).
            geometry: { coordinates: [121.5, 25.03] },
            properties: {
              label: 'Some unrelated place, Taiwan',
              country_a: 'TWN',
            },
          },
        ],
      });
      const service = buildService(getJson);

      const results = await service.geocodeMultiple('Central World');

      expect(results).toEqual([
        {
          lat: 13.7563,
          lng: 100.5018,
          formattedAddress: 'Central World, Bangkok, Thailand',
        },
      ]);
    });

    it('returns an empty array (not an error) when no candidate remains after the defensive filter', async () => {
      const getJson = jest.fn().mockResolvedValue({
        features: [
          {
            geometry: { coordinates: [121.5, 25.03] },
            properties: {
              label: 'Some unrelated place, Taiwan',
              country_a: 'TWN',
            },
          },
        ],
      });
      const service = buildService(getJson);

      const results = await service.geocodeMultiple('a place outside Thailand');

      expect(results).toEqual([]);
    });

    it('returns an empty array (not an error) for a genuinely empty features response', async () => {
      const getJson = jest.fn().mockResolvedValue({ features: [] });
      const service = buildService(getJson);

      const results = await service.geocodeMultiple(
        'a place that does not exist',
      );

      expect(results).toEqual([]);
    });

    it('wraps an OrsApiError into a generic UpstreamMapsException', async () => {
      const getJson = jest.fn().mockRejectedValue(new OrsApiError(502));
      const service = buildService(getJson);

      await expect(
        service.geocodeMultiple('Central World'),
      ).rejects.toBeInstanceOf(UpstreamMapsException);
    });
  });
});
