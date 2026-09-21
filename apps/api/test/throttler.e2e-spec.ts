import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ORS_THROTTLE } from '../src/common/throttle.constants';
import {
  buildSuccessTestApp,
  createGoogleMapsServiceMocks,
  GoogleMapsServiceMocks,
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
  let mocks: GoogleMapsServiceMocks;

  beforeAll(async () => {
    mocks = createGoogleMapsServiceMocks();
    mocks.routesService.computeRoute.mockResolvedValue(fakeComputeRouteResult);
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
});
