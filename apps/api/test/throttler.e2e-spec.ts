import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ORS_THROTTLE, TILE_THROTTLE } from '../src/common/throttle.constants';
import {
  buildSuccessTestApp,
  createOrsServiceMocks,
  OrsServiceMocks,
} from './utils/test-app';

const fakeComputeRouteResult = {
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
  steps: [
    { instruction: 'Head south', distanceMeters: 5230, durationSeconds: 780 },
  ],
};

describe('Throttling (e2e)', () => {
  let app: INestApplication;
  let mocks: OrsServiceMocks;

  beforeAll(async () => {
    mocks = createOrsServiceMocks();
    mocks.routesService.computeRoute.mockResolvedValue(fakeComputeRouteResult);
    mocks.osmTileClient.getTile.mockResolvedValue({
      buffer: Buffer.from('fake-tile-bytes'),
      contentType: 'image/png',
    });
    app = await buildSuccessTestApp(mocks);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 once POST /route is called more than the configured limit', async () => {
    const body = { origin: { lat: 13.7563, lng: 100.5018 } };
    const server = app.getHttpServer();

    const statuses: number[] = [];
    // ORS_THROTTLE.limit is the number of requests allowed per window —
    // firing one more than that must trip the throttler.
    for (let i = 0; i < ORS_THROTTLE.limit + 1; i += 1) {
      // land within the same throttler window deterministically.
      const response = await request(server).post('/api/v1/route').send(body);
      statuses.push(response.status);
    }

    expect(statuses.slice(0, ORS_THROTTLE.limit)).not.toContain(429);
    expect(statuses[ORS_THROTTLE.limit]).toBe(429);
  });

  it('does not throttle GET /tiles/:z/:x/:y at the tight ORS_THROTTLE limit', async () => {
    const server = app.getHttpServer();

    // Fire more requests than ORS_THROTTLE.limit but comfortably under
    // TILE_THROTTLE.limit. If tiles were still (accidentally) sharing
    // ORS_THROTTLE, this batch would contain a 429; TILE_THROTTLE being an
    // actually separate, higher limit means it should not.
    const requestCount = ORS_THROTTLE.limit + 5;
    expect(requestCount).toBeLessThan(TILE_THROTTLE.limit);

    const statuses: number[] = [];
    for (let i = 0; i < requestCount; i += 1) {
      const response = await request(server).get('/api/v1/tiles/1/0/0');
      statuses.push(response.status);
    }

    expect(statuses).not.toContain(429);
  });
});
