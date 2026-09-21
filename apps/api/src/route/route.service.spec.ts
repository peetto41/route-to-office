import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import { GeocodingService } from '../google-maps/geocoding.service';
import { RoutesService } from '../google-maps/routes.service';
import { RouteService } from './route.service';

/**
 * Unit tests for `RouteService`'s orchestration: resolving `origin` (address
 * vs coordinates), falling back to the company location as the default
 * destination, and computing `arrivalTime` as `now + durationSeconds` at
 * request time (see references/backend-nestjs.md's "Testing" section item 1
 * and the "Caching" section's explanation of why `POST /route` is never
 * cached).
 */
describe('RouteService', () => {
  const computedRoute = {
    distanceMeters: 5230,
    durationSeconds: 780,
    route: {
      type: 'LineString' as const,
      coordinates: [[100.539, 13.7469]] as [number, number][],
    },
    bounds: [
      [100.5018, 13.7469],
      [100.539, 13.7563],
    ] as [[number, number], [number, number]],
    steps: [],
  };

  function buildService() {
    const geocode = jest.fn();
    const computeRoute = jest.fn().mockResolvedValue(computedRoute);
    const geocodingService = { geocode } as unknown as GeocodingService;
    const routesService = { computeRoute } as unknown as RoutesService;
    const configService = {
      get: jest.fn((key: keyof EnvironmentVariables) => {
        if (key === 'COMPANY_LAT') return 13.7469;
        if (key === 'COMPANY_LNG') return 100.539;
        throw new Error(`unexpected config key requested in test: ${key}`);
      }),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    const service = new RouteService(
      geocodingService,
      routesService,
      configService,
    );
    return { service, geocode, computeRoute };
  }

  it('computes arrivalTime as now + durationSeconds, not a cached/stale value', async () => {
    const { service, computeRoute } = buildService();
    const before = Date.now();

    const result = await service.createRoute({
      origin: { lat: 13.7563, lng: 100.5018 },
    });

    const after = Date.now();
    const arrivalMs = new Date(result.arrivalTime).getTime();

    expect(computeRoute).toHaveBeenCalledTimes(1);
    expect(arrivalMs).toBeGreaterThanOrEqual(
      before + computedRoute.durationSeconds * 1000,
    );
    expect(arrivalMs).toBeLessThanOrEqual(
      after + computedRoute.durationSeconds * 1000,
    );
  });

  it('never includes durationInTrafficSeconds in the response, regardless of orchestration', async () => {
    const { service } = buildService();

    const result = await service.createRoute({
      origin: { lat: 13.7563, lng: 100.5018 },
    });

    expect(result).not.toHaveProperty('durationInTrafficSeconds');
  });

  it('geocodes the origin address instead of passing it straight through when address is given', async () => {
    const { service, geocode, computeRoute } = buildService();
    geocode.mockResolvedValue({
      lat: 13.7563,
      lng: 100.5018,
      formattedAddress: 'Siam Paragon, Bangkok',
    });

    await service.createRoute({
      origin: { address: 'Siam Paragon' },
    });

    expect(geocode).toHaveBeenCalledWith('Siam Paragon');
    expect(computeRoute).toHaveBeenCalledWith(
      { lat: 13.7563, lng: 100.5018 },
      { lat: 13.7469, lng: 100.539 },
    );
  });

  it('falls back to the company location as destination when none is given', async () => {
    const { service, computeRoute } = buildService();

    await service.createRoute({
      origin: { lat: 13.7563, lng: 100.5018 },
    });

    expect(computeRoute).toHaveBeenCalledWith(
      { lat: 13.7563, lng: 100.5018 },
      { lat: 13.7469, lng: 100.539 },
    );
  });

  it('uses an explicit destination instead of the company location when one is given', async () => {
    const { service, computeRoute } = buildService();

    await service.createRoute({
      origin: { lat: 13.7563, lng: 100.5018 },
      destination: { lat: 13.7, lng: 100.6 },
    });

    expect(computeRoute).toHaveBeenCalledWith(
      { lat: 13.7563, lng: 100.5018 },
      { lat: 13.7, lng: 100.6 },
    );
  });
});
