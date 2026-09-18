import { UpstreamMapsException } from '../common/exceptions/upstream-maps.exception';
import { OrsApiError, OrsHttpClient } from './ors-http.client';
import { RoutesService } from './routes.service';

/**
 * Unit tests for the ORS Directions response -> this app's `RouteResponseDto`
 * mapping (see references/backend-nestjs.md's "Testing" section item 1).
 * Complements `geocoding.service.spec.ts`'s request-shape regression test:
 * this file is about not getting the *response* side of the `[lon,lat]` vs
 * `{lat,lng}` reversal backwards, and about the bbox reshape and the removed
 * `durationInTrafficSeconds` field never reappearing.
 */
describe('RoutesService', () => {
  function buildService(postJson: jest.Mock) {
    const httpClient = {
      postJson,
      getJson: jest.fn(),
    } as unknown as OrsHttpClient;
    return new RoutesService(httpClient);
  }

  const origin = { lat: 13.7469, lng: 100.539 }; // company
  const destination = { lat: 13.7563, lng: 100.5018 }; // Siam Paragon

  it('sends coordinates to ORS as [lon, lat], not swapped', async () => {
    const postJson = jest.fn().mockResolvedValue({
      features: [
        {
          geometry: { type: 'LineString', coordinates: [[100.539, 13.7469]] },
          bbox: [100.5018, 13.7469, 100.539, 13.7563],
          properties: {
            summary: { distance: 5230, duration: 780 },
            segments: [],
          },
        },
      ],
    });
    const service = buildService(postJson);

    await service.computeRoute(origin, destination);

    expect(postJson).toHaveBeenCalledTimes(1);
    const [url, body] = postJson.mock.calls[0];
    expect(url).toBe(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
    );
    expect(body).toEqual({
      coordinates: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
      ],
    });
  });

  it('reshapes the GeoJSON bbox into [[minLng,minLat],[maxLng,maxLat]]', async () => {
    const postJson = jest.fn().mockResolvedValue({
      features: [
        {
          geometry: {
            type: 'LineString',
            coordinates: [
              [100.5018, 13.7563],
              [100.539, 13.7469],
            ],
          },
          bbox: [100.5018, 13.7469, 100.539, 13.7563],
          properties: {
            summary: { distance: 5230, duration: 780 },
            segments: [],
          },
        },
      ],
    });
    const service = buildService(postJson);

    const result = await service.computeRoute(origin, destination);

    expect(result.bounds).toEqual([
      [100.5018, 13.7469],
      [100.539, 13.7563],
    ]);
  });

  it('derives bounds from the route coordinates when ORS omits bbox', async () => {
    const postJson = jest.fn().mockResolvedValue({
      features: [
        {
          geometry: {
            type: 'LineString',
            coordinates: [
              [100.5018, 13.7563],
              [100.539, 13.7469],
            ],
          },
          // no bbox
          properties: {
            summary: { distance: 5230, duration: 780 },
            segments: [],
          },
        },
      ],
    });
    const service = buildService(postJson);

    const result = await service.computeRoute(origin, destination);

    expect(result.bounds).toEqual([
      [100.5018, 13.7469],
      [100.539, 13.7563],
    ]);
  });

  it('maps distance/duration and steps field-for-field, with no unit conversion', async () => {
    const postJson = jest.fn().mockResolvedValue({
      features: [
        {
          geometry: { type: 'LineString', coordinates: [[100.539, 13.7469]] },
          bbox: [100.5018, 13.7469, 100.539, 13.7563],
          properties: {
            summary: { distance: 5230.4, duration: 780.6 },
            segments: [
              {
                steps: [
                  {
                    instruction: 'Head south',
                    distance: 100.2,
                    duration: 20.7,
                  },
                  {
                    instruction: 'Turn left',
                    distance: 5130.2,
                    duration: 759.9,
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    const service = buildService(postJson);

    const result = await service.computeRoute(origin, destination);

    expect(result.distanceMeters).toBe(5230);
    expect(result.durationSeconds).toBe(781);
    expect(result.steps).toEqual([
      { instruction: 'Head south', distanceMeters: 100, durationSeconds: 21 },
      { instruction: 'Turn left', distanceMeters: 5130, durationSeconds: 760 },
    ]);
  });

  it('regression: the response never carries a durationInTrafficSeconds field — ORS has no traffic-aware mode', async () => {
    const postJson = jest.fn().mockResolvedValue({
      features: [
        {
          geometry: { type: 'LineString', coordinates: [[100.539, 13.7469]] },
          bbox: [100.5018, 13.7469, 100.539, 13.7563],
          properties: {
            summary: { distance: 5230, duration: 780 },
            segments: [],
          },
        },
      ],
    });
    const service = buildService(postJson);

    const result = await service.computeRoute(origin, destination);

    expect(result).not.toHaveProperty('durationInTrafficSeconds');
    expect(JSON.stringify(result)).not.toContain('durationInTraffic');
  });

  it('wraps an OrsApiError into a generic UpstreamMapsException', async () => {
    const postJson = jest.fn().mockRejectedValue(new OrsApiError(502));
    const service = buildService(postJson);

    await expect(
      service.computeRoute(origin, destination),
    ).rejects.toBeInstanceOf(UpstreamMapsException);
  });

  it('throws UpstreamMapsException when ORS returns no usable route', async () => {
    const postJson = jest.fn().mockResolvedValue({ features: [] });
    const service = buildService(postJson);

    await expect(
      service.computeRoute(origin, destination),
    ).rejects.toBeInstanceOf(UpstreamMapsException);
  });
});
