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
import { GeocodingService } from '../../src/openrouteservice/geocoding.service';
import { OrsHttpClient } from '../../src/openrouteservice/ors-http.client';
import { RoutesService } from '../../src/openrouteservice/routes.service';
import { OsmTileClient } from '../../src/tiles/osm-tile.client';
import { setTestEnv, TEST_API_KEY } from './test-env';

export { TEST_API_KEY };

export interface OrsServiceMocks {
  routesService: { computeRoute: jest.Mock };
  geocodingService: { geocode: jest.Mock };
  osmTileClient: { getTile: jest.Mock };
}

export interface OrsHttpClientMock {
  postJson: jest.Mock;
  getJson: jest.Mock;
}

export function createOrsServiceMocks(): OrsServiceMocks {
  return {
    routesService: { computeRoute: jest.fn() },
    geocodingService: { geocode: jest.fn() },
    osmTileClient: { getTile: jest.fn() },
  };
}

export function createOrsHttpClientMock(): OrsHttpClientMock {
  return {
    postJson: jest.fn(),
    getJson: jest.fn(),
  };
}

/**
 * Builds a full app (same global pipes/filters as `main.ts`) with
 * `RoutesService`, `GeocodingService`, and `OsmTileClient` replaced by fakes
 * — i.e. every code path that would otherwise call OpenRouteService (or
 * OpenStreetMap) is a controlled fake. Use this for tests that need an
 * ORS-backed endpoint to succeed predictably.
 */
export async function buildSuccessTestApp(
  mocks: OrsServiceMocks,
): Promise<INestApplication> {
  setTestEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RoutesService)
    .useValue(mocks.routesService)
    .overrideProvider(GeocodingService)
    .useValue(mocks.geocodingService)
    .overrideProvider(OsmTileClient)
    .useValue(mocks.osmTileClient)
    .compile();

  return initApp(moduleRef);
}

/**
 * Builds a full app with only the *lowest-level* HTTP clients
 * (`OrsHttpClient`, `OsmTileClient`) replaced by fakes that always reject —
 * the real `RoutesService`/`GeocodingService` code still runs, so this
 * exercises the real "ORS failed" -> `UpstreamMapsException` conversion, not
 * a stubbed-out version of it. Use this to force an upstream ORS failure
 * end-to-end.
 */
export async function buildFailureTestApp(
  orsHttpClientMock: OrsHttpClientMock,
  osmTileClientMock: { getTile: jest.Mock },
): Promise<INestApplication> {
  setTestEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(OrsHttpClient)
    .useValue(orsHttpClientMock)
    .overrideProvider(OsmTileClient)
    .useValue(osmTileClientMock)
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
