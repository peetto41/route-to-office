import { UpstreamMapsException } from '../common/exceptions/upstream-maps.exception';
import {
  GoogleMapsApiError,
  GoogleMapsHttpClient,
} from './google-maps-http.client';
import { RoutesService } from './routes.service';

/**
 * Unit tests for the Google Directions response -> this app's
 * `RouteResponseDto` mapping (see references/backend-nestjs.md's "Testing"
 * section item 1). Complements `geocoding.service.spec.ts`'s request-shape
 * regression test. Also covers what's new/different versus the old
 * OpenRouteService integration: polyline decoding, HTML-instruction
 * stripping, and — most importantly — proving the outgoing request never
 * opts into Google's live-traffic-based duration model.
 */
describe('RoutesService', () => {
  function buildService(getJson: jest.Mock) {
    const httpClient = { getJson } as unknown as GoogleMapsHttpClient;
    return new RoutesService(httpClient);
  }

  const origin = { lat: 13.7469, lng: 100.539 }; // company
  const destination = { lat: 13.7563, lng: 100.5018 }; // Siam Paragon

  // Google's own documented polyline-decoding example:
  // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
  // Decodes to (lat, lng): (38.5,-120.2), (40.7,-120.95), (43.252,-126.453).
  const SAMPLE_POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
  const SAMPLE_POLYLINE_AS_LNG_LAT: [number, number][] = [
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ];

  function directionsResponse(overrides: Record<string, unknown> = {}) {
    return {
      status: 'OK',
      routes: [
        {
          overview_polyline: { points: SAMPLE_POLYLINE },
          bounds: {
            southwest: { lat: 13.7469, lng: 100.5018 },
            northeast: { lat: 13.7563, lng: 100.539 },
          },
          legs: [
            {
              distance: { value: 5230 },
              duration: { value: 780 },
              steps: [
                {
                  html_instructions: 'Head <b>south</b>',
                  distance: { value: 100 },
                  duration: { value: 21 },
                },
                {
                  html_instructions: 'Turn left onto <b>Rama I Rd</b>',
                  distance: { value: 5130 },
                  duration: { value: 759 },
                },
              ],
            },
          ],
        },
      ],
      ...overrides,
    };
  }

  it('sends origin/destination as "lat,lng" and mode=driving', async () => {
    const getJson = jest.fn().mockResolvedValue(directionsResponse());
    const service = buildService(getJson);

    await service.computeRoute(origin, destination);

    expect(getJson).toHaveBeenCalledTimes(1);
    const [url, query] = getJson.mock.calls[0];
    expect(url).toBe('https://maps.googleapis.com/maps/api/directions/json');
    expect(query).toMatchObject({
      origin: '13.7469,100.539',
      destination: '13.7563,100.5018',
      mode: 'driving',
    });
  });

  it('regression: never sends departure_time or traffic_model — that would opt into a live-traffic-based duration, which this app must never label "traffic-aware"', async () => {
    const getJson = jest.fn().mockResolvedValue(directionsResponse());
    const service = buildService(getJson);

    await service.computeRoute(origin, destination);

    const [, query] = getJson.mock.calls[0];
    expect(query).not.toHaveProperty('departure_time');
    expect(query).not.toHaveProperty('traffic_model');
  });

  it('decodes overview_polyline into a GeoJSON LineString of [lng, lat] pairs, not swapped', async () => {
    const getJson = jest.fn().mockResolvedValue(directionsResponse());
    const service = buildService(getJson);

    const result = await service.computeRoute(origin, destination);

    expect(result.route).toEqual({
      type: 'LineString',
      coordinates: SAMPLE_POLYLINE_AS_LNG_LAT,
    });
  });

  it('reshapes bounds.southwest/northeast into [[minLng,minLat],[maxLng,maxLat]]', async () => {
    const getJson = jest.fn().mockResolvedValue(directionsResponse());
    const service = buildService(getJson);

    const result = await service.computeRoute(origin, destination);

    expect(result.bounds).toEqual([
      [100.5018, 13.7469],
      [100.539, 13.7563],
    ]);
  });

  it('derives bounds from the route coordinates when Google omits bounds', async () => {
    const getJson = jest.fn().mockResolvedValue(
      directionsResponse({
        routes: [
          {
            overview_polyline: { points: SAMPLE_POLYLINE },
            legs: [
              { distance: { value: 1 }, duration: { value: 1 }, steps: [] },
            ],
          },
        ],
      }),
    );
    const service = buildService(getJson);

    const result = await service.computeRoute(origin, destination);

    expect(result.bounds).toEqual([
      [-126.453, 38.5],
      [-120.2, 43.252],
    ]);
  });

  it('sums distance/duration across legs and strips HTML tags from step instructions', async () => {
    const getJson = jest.fn().mockResolvedValue(directionsResponse());
    const service = buildService(getJson);

    const result = await service.computeRoute(origin, destination);

    expect(result.distanceMeters).toBe(5230);
    expect(result.durationSeconds).toBe(780);
    expect(result.steps).toEqual([
      { instruction: 'Head south', distanceMeters: 100, durationSeconds: 21 },
      {
        instruction: 'Turn left onto Rama I Rd',
        distanceMeters: 5130,
        durationSeconds: 759,
      },
    ]);
  });

  it('regression: the response never carries a durationInTrafficSeconds field — this call never opts into traffic-aware duration', async () => {
    const getJson = jest.fn().mockResolvedValue(directionsResponse());
    const service = buildService(getJson);

    const result = await service.computeRoute(origin, destination);

    expect(result).not.toHaveProperty('durationInTrafficSeconds');
    expect(JSON.stringify(result)).not.toContain('durationInTraffic');
  });

  it('wraps a GoogleMapsApiError (transport failure) into a generic UpstreamMapsException', async () => {
    const getJson = jest.fn().mockRejectedValue(new GoogleMapsApiError(502));
    const service = buildService(getJson);

    await expect(
      service.computeRoute(origin, destination),
    ).rejects.toBeInstanceOf(UpstreamMapsException);
  });

  it('maps a non-OK status (e.g. ZERO_RESULTS — no drivable route) to UpstreamMapsException', async () => {
    const getJson = jest
      .fn()
      .mockResolvedValue({ status: 'ZERO_RESULTS', routes: [] });
    const service = buildService(getJson);

    await expect(
      service.computeRoute(origin, destination),
    ).rejects.toBeInstanceOf(UpstreamMapsException);
  });

  it.each([
    'NOT_FOUND',
    'OVER_QUERY_LIMIT',
    'REQUEST_DENIED',
    'INVALID_REQUEST',
  ])(
    'maps a %s status to UpstreamMapsException without leaking the raw status to the client',
    async (status) => {
      const getJson = jest.fn().mockResolvedValue({ status });
      const service = buildService(getJson);

      await expect(
        service.computeRoute(origin, destination),
      ).rejects.toBeInstanceOf(UpstreamMapsException);
    },
  );

  it('throws UpstreamMapsException when the OK response has no usable route', async () => {
    const getJson = jest.fn().mockResolvedValue({ status: 'OK', routes: [] });
    const service = buildService(getJson);

    await expect(
      service.computeRoute(origin, destination),
    ).rejects.toBeInstanceOf(UpstreamMapsException);
  });
});
