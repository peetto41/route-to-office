import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import { GeocodingService } from './geocoding.service';
import { OrsHttpClient } from './ors-http.client';

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

  it('always sends boundary.country=TH and focus.point from the company coordinates', async () => {
    const getJson = jest.fn().mockResolvedValue({
      features: [
        {
          geometry: { coordinates: [100.5018, 13.7563] },
          properties: { label: 'Siam Paragon, Bangkok, Thailand' },
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
      'boundary.country': 'TH',
      'focus.point.lon': '100.539',
      'focus.point.lat': '13.7469',
    });
  });
});
