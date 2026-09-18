import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ORS_THROTTLE } from '../src/common/throttle.constants';
import {
  buildSuccessTestApp,
  createOrsServiceMocks,
  OrsServiceMocks,
} from './utils/test-app';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let mocks: OrsServiceMocks;

  beforeAll(async () => {
    mocks = createOrsServiceMocks();
    app = await buildSuccessTestApp(mocks);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns 200 { status: "ok" }', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('never gets rate-limited, even well past ORS_THROTTLE.limit requests in a row', async () => {
    const server = app.getHttpServer();

    // Fire well past the tight ORS_THROTTLE limit that `POST /route` and
    // `GET /geocode` are subject to. `GET /health` carries `@SkipThrottle()`
    // (see src/health/health.controller.ts), so none of these should ever
    // 429 — proving the skip actually works, not just that one request
    // succeeds.
    const requestCount = ORS_THROTTLE.limit * 5;
    const statuses: number[] = [];
    for (let i = 0; i < requestCount; i += 1) {
      const response = await request(server).get('/api/v1/health');
      statuses.push(response.status);
    }

    expect(statuses).not.toContain(429);
    expect(statuses.every((status) => status === 200)).toBe(true);
  });
});
