import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouteQuery } from './useRoute';
import type { RouteResponse } from '~/types/api';

const routeResponse: RouteResponse = {
  distanceMeters: 12_345,
  durationSeconds: 1_800,
  arrivalTime: '2026-09-18T09:00:00.000Z',
  route: {
    type: 'LineString',
    coordinates: [
      [100.5, 13.7],
      [100.6, 13.8],
    ],
  },
  bounds: [
    [100.5, 13.7],
    [100.6, 13.8],
  ],
  steps: [],
};

describe('useRouteQuery', () => {
  beforeEach(() => {
    vi.stubGlobal('$fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets loading true while the request is in flight, then false once it settles', async () => {
    let resolveFetch: (value: RouteResponse) => void;
    const pending = new Promise<RouteResponse>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      '$fetch',
      vi.fn(() => pending),
    );

    const { loading, fetchRoute } = useRouteQuery();
    expect(loading.value).toBe(false);

    const call = fetchRoute({ origin: { lat: 13.7, lng: 100.5 } });
    expect(loading.value).toBe(true);

    resolveFetch!(routeResponse);
    await call;

    expect(loading.value).toBe(false);
  });

  it('populates data on success and clears any previous error', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(routeResponse),
    );

    const { data, error, fetchRoute } = useRouteQuery();

    await fetchRoute({ origin: { lat: 13.7, lng: 100.5 } });
    expect(error.value).toBeTruthy();
    expect(data.value).toBeNull();

    await fetchRoute({ origin: { lat: 13.7, lng: 100.5 } });
    expect(error.value).toBeNull();
    expect(data.value).toEqual(routeResponse);
  });

  it('sets a Thai error message and nulls data on failure, without leaking the raw error', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockRejectedValue(new Error('upstream exploded: secret-detail')),
    );

    const { data, error, fetchRoute } = useRouteQuery();
    await fetchRoute({ origin: { lat: 13.7, lng: 100.5 } });

    expect(data.value).toBeNull();
    expect(error.value).toBeTruthy();
    expect(error.value).not.toContain('secret-detail');
  });

  it('reset() clears both data and error', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(routeResponse));

    const { data, error, fetchRoute, reset } = useRouteQuery();
    await fetchRoute({ origin: { lat: 13.7, lng: 100.5 } });
    expect(data.value).toEqual(routeResponse);

    reset();
    expect(data.value).toBeNull();
    expect(error.value).toBeNull();
  });
});
