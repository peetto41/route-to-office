import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OrsApiError } from '../src/openrouteservice/ors-http.client';
import {
  buildFailureTestApp,
  buildSuccessTestApp,
  createOrsHttpClientMock,
  createOrsServiceMocks,
  OrsHttpClientMock,
  OrsServiceMocks,
  TEST_API_KEY,
} from './utils/test-app';

/**
 * The most important test in this module (see
 * references/backend-nestjs.md's "Testing" section): asserts `ORS_API_KEY`'s
 * value never appears in any response body or header, for any endpoint,
 * whether the underlying OpenRouteService call succeeds or fails. Makes
 * CLAUDE.md's "the key never reaches the client" a verified fact instead of
 * an assumption.
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
  describe('when every ORS-backed call succeeds', () => {
    let app: INestApplication;
    let mocks: OrsServiceMocks;

    beforeAll(async () => {
      mocks = createOrsServiceMocks();
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
      mocks.osmTileClient.getTile.mockResolvedValue({
        buffer: Buffer.from('fake-osm-tile-bytes'),
        contentType: 'image/png',
      });
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

    it('GET /tiles/:z/:x/:y response does not contain the key', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/tiles/1/0/0',
      );
      expect(response.status).toBe(200);
      assertNoKeyLeak(response);
    });
  });

  describe('when every ORS-backed call is forced to fail', () => {
    let app: INestApplication;
    let orsHttpClientMock: OrsHttpClientMock;
    let osmTileClientMock: { getTile: jest.Mock };

    beforeAll(async () => {
      orsHttpClientMock = createOrsHttpClientMock();
      // The OrsApiError carries the request URL nowhere — see
      // src/openrouteservice/ors-http.client.ts — but reject with a status
      // that embeds the key nowhere either, to prove the *whole chain* is
      // safe, not just this one error type.
      orsHttpClientMock.postJson.mockRejectedValue(new OrsApiError(502));
      orsHttpClientMock.getJson.mockRejectedValue(new OrsApiError(502));
      osmTileClientMock = { getTile: jest.fn() };
      osmTileClientMock.getTile.mockRejectedValue(
        new Error(`simulated OSM failure while using key=${TEST_API_KEY}`),
      );
      app = await buildFailureTestApp(orsHttpClientMock, osmTileClientMock);
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

    it('GET /tiles/:z/:x/:y error response does not contain the key', async () => {
      // The mocked OSM failure above deliberately embeds the literal key in
      // its (unthrown-to-the-client) Error message, to prove the filter
      // strips it rather than merely not producing it in this particular
      // path.
      const response = await request(app.getHttpServer()).get(
        '/api/v1/tiles/1/0/0',
      );
      expect(response.status).toBeGreaterThanOrEqual(500);
      assertNoKeyLeak(response);
    });
  });
});
