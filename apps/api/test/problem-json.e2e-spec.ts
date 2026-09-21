import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  buildSuccessTestApp,
  createGoogleMapsServiceMocks,
  GoogleMapsServiceMocks,
} from './utils/test-app';

describe('Problem+JSON error shape (e2e)', () => {
  let app: INestApplication;
  let mocks: GoogleMapsServiceMocks;

  beforeAll(async () => {
    mocks = createGoogleMapsServiceMocks();
    app = await buildSuccessTestApp(mocks);
  });

  afterAll(async () => {
    await app.close();
  });

  function expectProblemJson(response: request.Response, status: number) {
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toMatchObject({
      type: expect.any(String),
      title: expect.any(String),
      status,
      detail: expect.any(String),
      instance: expect.any(String),
    });
  }

  it('shapes a DTO validation failure (bad lat/lng) as problem+json', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/route')
      .send({ origin: { lat: 999, lng: 100.5 } });
    expectProblemJson(response, 400);
  });

  it('shapes a Thailand-bbox validation failure (coordinates outside Thailand) as problem+json 400', async () => {
    // Well-formed lat/lng (each individually valid per @IsLatitude/
    // @IsLongitude), but outside Thailand's bounding box — Taipei, not
    // Bangkok. See SKILL.md's "Thailand-only scope" section.
    const response = await request(app.getHttpServer())
      .post('/api/v1/route')
      .send({ origin: { lat: 25.03, lng: 121.5 } });
    expectProblemJson(response, 400);
  });

  it('shapes a validation failure with an origin missing both address and coords', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/route')
      .send({ origin: {} });
    expectProblemJson(response, 400);
  });

  it('shapes a geocode query validation failure as problem+json', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/geocode');
    expectProblemJson(response, 400);
  });

  it('shapes a 404 for an unknown route as problem+json', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/does-not-exist',
    );
    expectProblemJson(response, 404);
  });

  it("shapes a geocoding miss (zero results) on POST /route's address branch as problem+json 404", async () => {
    const { GeocodeNotFoundException } =
      await import('../src/common/exceptions/upstream-maps.exception');
    mocks.geocodingService.geocode.mockRejectedValueOnce(
      new GeocodeNotFoundException(),
    );
    const response = await request(app.getHttpServer())
      .post('/api/v1/route')
      .send({ origin: { address: 'a place that does not exist anywhere' } });
    expectProblemJson(response, 404);
  });

  it('returns 200 with an empty results array for a GET /geocode miss (not an error)', async () => {
    mocks.geocodingService.geocodeMultiple.mockResolvedValueOnce([]);
    const response = await request(app.getHttpServer())
      .get('/api/v1/geocode')
      .query({ address: 'a place that does not exist anywhere' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ results: [] });
  });

  it('never includes a stack trace in an error response', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/route')
      .send({ origin: { lat: 999, lng: 100.5 } });
    expect(response.body).not.toHaveProperty('stack');
    // A real stack trace has multiple "\n    at " frame lines and mentions
    // source paths — neither should ever show up in `detail`.
    expect(response.body.detail).not.toMatch(/\n\s*at\s/);
    expect(response.body.detail).not.toContain('node_modules');
    expect(response.body.detail).not.toContain(__dirname);
  });
});
