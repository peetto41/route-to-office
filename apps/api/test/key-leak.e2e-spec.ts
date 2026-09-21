import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { GoogleMapsApiError } from '../src/google-maps/google-maps-http.client';
import {
  buildFailureTestApp,
  buildSuccessTestApp,
  createGoogleMapsHttpClientMock,
  createGoogleMapsServiceMocks,
  GoogleMapsHttpClientMock,
  GoogleMapsServiceMocks,
  TEST_API_KEY,
} from './utils/test-app';

/**
 * The most important test in this module (see
 * references/backend-nestjs.md's "Testing" section): asserts
 * `GOOGLE_MAPS_SERVER_API_KEY`'s value never appears in any response body or
 * header, for any endpoint, whether the underlying Google Maps Platform call
 * succeeds or fails. Makes CLAUDE.md's "the key never reaches the client"
 * rule a verified fact instead of an assumption — this matters even more for
 * Google's classic Directions/Geocoding REST APIs than it did for ORS, since
 * Google requires the key as a `key=` query-string parameter with no header
 * alternative (see `google-maps-http.client.ts`'s doc comment).
 */
function assertNoKeyLeak(response: request.Response): void {
  const serializedBody = Buffer.isBuffer(response.body)
    ? response.body.toString('latin1')
    : JSON.stringify(response.body);
  expect(serializedBody).not.toContain(TEST_API_KEY);

  const serializedHeaders = JSON.stringify(response.headers);
  expect(serializedHeaders).not.toContain(TEST_API_KEY);

  if (typeof response.text === 'string') {
    expect(response.text).not.toContain(TEST_API_KEY);
  }
}

describe('No API-key leak (e2e)', () => {
  describe('when every Google-Maps-backed call succeeds', () => {
    let app: INestApplication;
    let mocks: GoogleMapsServiceMocks;

    beforeAll(async () => {
      mocks = createGoogleMapsServiceMocks();
      mocks.routesService.computeRoute.mockResolvedValue({
        distanceMeters: 5230,
        durationSeconds: 780,
        route: {
          type: 'LineString' as const,
          coordinates: [
            [100.5018, 13.7563],
            [100.539, 13.7469],
          ] as [number, number][],
        },
        bounds: [
          [100.5018, 13.7469],
          [100.539, 13.7563],
        ] as [[number, number], [number, number]],
        steps: [],
      });
      mocks.geocodingService.geocode.mockResolvedValue({
        lat: 13.7563,
        lng: 100.5018,
        formattedAddress: '1 Somewhere Rd, Bangkok',
      });
      mocks.geocodingService.geocodeMultiple.mockResolvedValue([
        {
          lat: 13.7563,
          lng: 100.5018,
          formattedAddress: '1 Somewhere Rd, Bangkok',
        },
      ]);
      app = await buildSuccessTestApp(mocks);
    });

    afterAll(async () => {
      await app.close();
    });

    it('POST /route response does not contain the key', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/route')
        .send({ origin: { lat: 13.7563, lng: 100.5018 } });
      expect(response.status).toBe(201);
      assertNoKeyLeak(response);
    });

    it('GET /geocode response does not contain the key', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/geocode')
        .query({ address: 'Siam Paragon, Bangkok' });
      expect(response.status).toBe(200);
      assertNoKeyLeak(response);
    });

    it('GET /company response does not contain the key', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/company',
      );
      expect(response.status).toBe(200);
      assertNoKeyLeak(response);
    });
  });

  describe('when every Google-Maps-backed call is forced to fail', () => {
    let app: INestApplication;
    let googleMapsHttpClientMock: GoogleMapsHttpClientMock;

    beforeAll(async () => {
      googleMapsHttpClientMock = createGoogleMapsHttpClientMock();
      // The GoogleMapsApiError carries the request URL nowhere — see
      // src/google-maps/google-maps-http.client.ts — but reject with a
      // status that embeds the key nowhere either, to prove the *whole
      // chain* is safe, not just this one error type.
      googleMapsHttpClientMock.getJson.mockRejectedValue(
        new GoogleMapsApiError(502),
      );
      app = await buildFailureTestApp(googleMapsHttpClientMock);
    });

    afterAll(async () => {
      await app.close();
    });

    it('POST /route error response does not contain the key', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/route')
        .send({ origin: { lat: 13.7563, lng: 100.5018 } });
      expect(response.status).toBeGreaterThanOrEqual(500);
      assertNoKeyLeak(response);
    });

    it('GET /geocode error response does not contain the key', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/geocode')
        .query({ address: 'Siam Paragon, Bangkok' });
      expect(response.status).toBeGreaterThanOrEqual(500);
      assertNoKeyLeak(response);
    });

    it('GET /company still succeeds and does not contain the key', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/company',
      );
      expect(response.status).toBe(200);
      assertNoKeyLeak(response);
    });
  });
});
