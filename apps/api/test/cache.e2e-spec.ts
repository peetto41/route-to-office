import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  buildSuccessTestApp,
  createOrsServiceMocks,
  OrsServiceMocks,
} from './utils/test-app';

describe('Caching (e2e)', () => {
  let app: INestApplication;
  let mocks: OrsServiceMocks;

  beforeAll(async () => {
    mocks = createOrsServiceMocks();
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

  it('calls the underlying Geocoding client once for two identical GET /geocode requests', async () => {
    const server = app.getHttpServer();
    const address = 'Siam Paragon, Bangkok';

    const first = await request(server)
      .get('/api/v1/geocode')
      .query({ address });
    const second = await request(server)
      .get('/api/v1/geocode')
      .query({ address });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(mocks.geocodingService.geocodeMultiple).toHaveBeenCalledTimes(1);
  });

  it('normalizes the address before using it as a cache key', async () => {
    const server = app.getHttpServer();

    await request(server)
      .get('/api/v1/geocode')
      .query({ address: '  Siam Paragon, Bangkok  ' });
    await request(server)
      .get('/api/v1/geocode')
      .query({ address: 'siam paragon, bangkok' });

    // Both requests above resolve to the same normalized cache key as the
    // "Siam Paragon, Bangkok" address already cached in the previous test,
    // so the mock should still have been called exactly once in total.
    expect(mocks.geocodingService.geocodeMultiple).toHaveBeenCalledTimes(1);
  });
});
