import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
// NOTE: importing `AppModule` here evaluates `ConfigModule.forRoot({
// validate })` immediately (it's part of a decorator argument, not deferred
// to `.compile()`), which validates `process.env` right then and there. By
// the time this file's imports run, `process.env` must already carry the
// fake test values — guaranteed by `test/utils/jest-setup-env.ts` (wired up
// via Jest's `setupFiles`, which runs before a test file's own imports are
// evaluated). See test-env.ts for why that file has zero Nest imports.
import { AppModule } from '../../src/app.module';
import { ProblemJsonFilter } from '../../src/common/filters/problem-json.filter';
import { GeocodingService } from '../../src/google-maps/geocoding.service';
import { GoogleMapsHttpClient } from '../../src/google-maps/google-maps-http.client';
import { RoutesService } from '../../src/google-maps/routes.service';
import { setTestEnv, TEST_API_KEY } from './test-env';

export { TEST_API_KEY };

export interface GoogleMapsServiceMocks {
  routesService: { computeRoute: jest.Mock };
  // `geocode` (single top result) backs `POST /route`'s address branch;
  // `geocodeMultiple` (up to 5 results) backs `GET /api/v1/geocode`'s picker
  // — see src/google-maps/geocoding.service.ts.
  geocodingService: { geocode: jest.Mock; geocodeMultiple: jest.Mock };
}

export interface GoogleMapsHttpClientMock {
  getJson: jest.Mock;
}

export function createGoogleMapsServiceMocks(): GoogleMapsServiceMocks {
  return {
    routesService: { computeRoute: jest.fn() },
    geocodingService: { geocode: jest.fn(), geocodeMultiple: jest.fn() },
  };
}

export function createGoogleMapsHttpClientMock(): GoogleMapsHttpClientMock {
  return {
    getJson: jest.fn(),
  };
}

/**
 * Builds a full app (same global pipes/filters as `main.ts`) with
 * `RoutesService` and `GeocodingService` replaced by fakes — i.e. every code
 * path that would otherwise call Google Maps Platform is a controlled fake.
 * Use this for tests that need a Google-Maps-backed endpoint to succeed
 * predictably.
 */
export async function buildSuccessTestApp(
  mocks: GoogleMapsServiceMocks,
): Promise<INestApplication> {
  setTestEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RoutesService)
    .useValue(mocks.routesService)
    .overrideProvider(GeocodingService)
    .useValue(mocks.geocodingService)
    .compile();

  return initApp(moduleRef);
}

/**
 * Builds a full app with only the *lowest-level* HTTP client
 * (`GoogleMapsHttpClient`) replaced by a fake that always rejects — the real
 * `RoutesService`/`GeocodingService` code still runs, so this exercises the
 * real "Google Maps call failed" -> `UpstreamMapsException` conversion, not a
 * stubbed-out version of it. Use this to force an upstream Google Maps
 * failure end-to-end.
 */
export async function buildFailureTestApp(
  googleMapsHttpClientMock: GoogleMapsHttpClientMock,
): Promise<INestApplication> {
  setTestEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleMapsHttpClient)
    .useValue(googleMapsHttpClientMock)
    .compile();

  return initApp(moduleRef);
}

async function initApp(
  moduleRef: Awaited<ReturnType<TestingModuleBuilder['compile']>>,
): Promise<INestApplication> {
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ProblemJsonFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN });
  await app.init();
  return app;
}
