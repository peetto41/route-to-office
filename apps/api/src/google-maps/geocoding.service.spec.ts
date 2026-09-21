import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import {
  GeocodeNotFoundException,
  UpstreamMapsException,
} from '../common/exceptions/upstream-maps.exception';
import { GeocodingService } from './geocoding.service';
import {
  GoogleMapsApiError,
  GoogleMapsHttpClient,
} from './google-maps-http.client';

/**
 * Regression test for a live bug found against the previous OpenRouteService
 * integration: an English-language query like "Siam Paragon" resolved to a
 * similarly-named place outside Thailand because the outgoing geocode
 * request carried no country/location bias. See
 * references/openrouteservice-api.md's "Geocoding" section — this test
 * asserts the *request shape* itself, not just the response mapping, since
 * that's exactly what let the bug slip through originally.
 */
describe('GeocodingService', () => {
  function buildService(getJson: jest.Mock) {
    const httpClient = { getJson } as unknown as GoogleMapsHttpClient;
    const configService = {
      get: jest.fn((key: keyof EnvironmentVariables) => {
        if (key === 'COMPANY_LAT') return 13.7469;
        if (key === 'COMPANY_LNG') return 100.539;
        throw new Error(`unexpected config key requested in test: ${key}`);
      }),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    return new GeocodingService(httpClient, configService);
  }

  function thResult(
    lat: number,
    lng: number,
    formattedAddress: string,
  ): Record<string, unknown> {
    return {
      formatted_address: formattedAddress,
      geometry: { location: { lat, lng } },
      address_components: [
        { short_name: 'TH', types: ['country', 'political'] },
      ],
    };
  }

  function nonThResult(
    lat: number,
    lng: number,
    formattedAddress: string,
    countryShortName: string,
  ): Record<string, unknown> {
    return {
      formatted_address: formattedAddress,
      geometry: { location: { lat, lng } },
      address_components: [
        { short_name: countryShortName, types: ['country', 'political'] },
      ],
    };
  }

  describe("geocode() — POST /route's address branch (single top result)", () => {
    it('always sends components=country:TH and a bounds bias derived from the company coordinates', async () => {
      const getJson = jest.fn().mockResolvedValue({
        status: 'OK',
        results: [
          thResult(13.7563, 100.5018, 'Siam Paragon, Bangkok, Thailand'),
        ],
      });
      const service = buildService(getJson);

      await service.geocode('Siam Paragon');

      expect(getJson).toHaveBeenCalledTimes(1);
      const [url, query] = getJson.mock.calls[0];
      expect(url).toBe('https://maps.googleapis.com/maps/api/geocode/json');
      expect(query).toMatchObject({
        address: 'Siam Paragon',
        components: 'country:TH',
        bounds: '13.2469,100.039|14.2469,101.039',
      });
    });

    it('maps geometry.location { lat, lng } straight through, no coordinate reversal needed (unlike ORS)', async () => {
      const getJson = jest.fn().mockResolvedValue({
        status: 'OK',
        results: [
          thResult(13.7563, 100.5018, 'Siam Paragon, Bangkok, Thailand'),
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

    it('treats ZERO_RESULTS as a normal "not found" result, not an error', async () => {
      const getJson = jest.fn().mockResolvedValue({ status: 'ZERO_RESULTS' });
      const service = buildService(getJson);

      await expect(
        service.geocode('a place that does not exist'),
      ).rejects.toBeInstanceOf(GeocodeNotFoundException);
    });

    it('wraps a GoogleMapsApiError (transport failure) into a generic UpstreamMapsException', async () => {
      const getJson = jest.fn().mockRejectedValue(new GoogleMapsApiError(502));
      const service = buildService(getJson);

      await expect(service.geocode('Siam Paragon')).rejects.toBeInstanceOf(
        UpstreamMapsException,
      );
    });

    it.each(['OVER_QUERY_LIMIT', 'REQUEST_DENIED', 'INVALID_REQUEST'])(
      'maps a %s status to UpstreamMapsException without leaking the raw status to the client',
      async (status) => {
        const getJson = jest.fn().mockResolvedValue({ status });
        const service = buildService(getJson);

        await expect(service.geocode('Siam Paragon')).rejects.toBeInstanceOf(
          UpstreamMapsException,
        );
      },
    );

    it('only ever considers a single top result, even if the upstream response somehow carries more than one', async () => {
      const getJson = jest.fn().mockResolvedValue({
        status: 'OK',
        results: [
          thResult(13.7563, 100.5018, 'Central World, Bangkok, Thailand'),
          thResult(13.8, 100.6, 'Some other Central World-ish place, Thailand'),
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

  describe('geocodeMultiple() — GET /api/v1/geocode (up to 5 candidates)', () => {
    it('sends the same components/bounds params as geocode()', async () => {
      const getJson = jest.fn().mockResolvedValue({ status: 'ZERO_RESULTS' });
      const service = buildService(getJson);

      await service.geocodeMultiple('Central World');

      expect(getJson).toHaveBeenCalledTimes(1);
      const [url, query] = getJson.mock.calls[0];
      expect(url).toBe('https://maps.googleapis.com/maps/api/geocode/json');
      expect(query).toMatchObject({
        address: 'Central World',
        components: 'country:TH',
        bounds: '13.2469,100.039|14.2469,101.039',
      });
    });

    it('maps every element of results[], not just the first, into { lat, lng, formattedAddress }', async () => {
      const getJson = jest.fn().mockResolvedValue({
        status: 'OK',
        results: [
          thResult(13.7563, 100.5018, 'Central World, Ratchaprasong, Bangkok'),
          thResult(13.75, 100.55, 'Central World Tower, Bangkok'),
          thResult(13.9, 100.6, 'Central World Soi 4, Bangkok'),
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

    it('caps results at 5 even if Google returns more', async () => {
      const results = Array.from({ length: 8 }, (_, i) =>
        thResult(13 + i * 0.01, 100 + i * 0.01, `Place ${i}`),
      );
      const getJson = jest.fn().mockResolvedValue({ status: 'OK', results });
      const service = buildService(getJson);

      const mapped = await service.geocodeMultiple('Common Name');

      expect(mapped).toHaveLength(5);
    });

    it('defensively excludes a non-TH result even if one somehow appears in the response, despite components=country:TH', async () => {
      const getJson = jest.fn().mockResolvedValue({
        status: 'OK',
        results: [
          thResult(13.7563, 100.5018, 'Central World, Bangkok, Thailand'),
          // A same-named place that slipped through upstream's own country
          // filter — exactly the scenario the defensive re-filter guards
          // against.
          nonThResult(25.03, 121.5, 'Some unrelated place, Taiwan', 'TW'),
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
        status: 'OK',
        results: [
          nonThResult(25.03, 121.5, 'Some unrelated place, Taiwan', 'TW'),
        ],
      });
      const service = buildService(getJson);

      const results = await service.geocodeMultiple('a place outside Thailand');

      expect(results).toEqual([]);
    });

    it('returns an empty array (not an error) for ZERO_RESULTS', async () => {
      const getJson = jest.fn().mockResolvedValue({ status: 'ZERO_RESULTS' });
      const service = buildService(getJson);

      const results = await service.geocodeMultiple(
        'a place that does not exist',
      );

      expect(results).toEqual([]);
    });

    it('wraps a GoogleMapsApiError (transport failure) into a generic UpstreamMapsException', async () => {
      const getJson = jest.fn().mockRejectedValue(new GoogleMapsApiError(502));
      const service = buildService(getJson);

      await expect(
        service.geocodeMultiple('Central World'),
      ).rejects.toBeInstanceOf(UpstreamMapsException);
    });
  });
});
