import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGeolocation } from './useGeolocation';

describe('useGeolocation', () => {
  const originalGeolocation = globalThis.navigator?.geolocation;

  afterEach(() => {
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      geolocation: originalGeolocation,
    });
  });

  it('starts idle and never leaks coordinates before a request', () => {
    const { state, coords, errorMessage } = useGeolocation();
    expect(state.value).toBe('idle');
    expect(coords.value).toBeNull();
    expect(errorMessage.value).toBeNull();
  });

  it('moves to requesting immediately, then granted with coordinates on success', () => {
    let successCallback: PositionCallback | undefined;
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          successCallback = success;
        }),
      },
    });

    const { state, coords, request } = useGeolocation();
    request();
    expect(state.value).toBe('requesting');

    successCallback?.({
      coords: { latitude: 13.7563, longitude: 100.5018 },
    } as GeolocationPosition);

    expect(state.value).toBe('granted');
    expect(coords.value).toEqual({ lat: 13.7563, lng: 100.5018 });
  });

  it('moves to denied on PERMISSION_DENIED and offers a fallback message', () => {
    let errorCallback: PositionErrorCallback | undefined;
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
          errorCallback = error;
        }),
      },
    });

    const { state, errorMessage, coords, request } = useGeolocation();
    request();
    errorCallback?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);

    expect(state.value).toBe('denied');
    expect(errorMessage.value).toBeTruthy();
    expect(coords.value).toBeNull();
  });

  it('moves to unavailable on POSITION_UNAVAILABLE/TIMEOUT', () => {
    let errorCallback: PositionErrorCallback | undefined;
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
          errorCallback = error;
        }),
      },
    });

    const { state, errorMessage, request } = useGeolocation();
    request();
    errorCallback?.({ code: 2, PERMISSION_DENIED: 1 } as GeolocationPositionError);

    expect(state.value).toBe('unavailable');
    expect(errorMessage.value).toBeTruthy();
  });

  it('goes straight to unavailable when the Geolocation API does not exist', () => {
    vi.stubGlobal('navigator', {});

    const { state, errorMessage, request } = useGeolocation();
    request();

    expect(state.value).toBe('unavailable');
    expect(errorMessage.value).toBeTruthy();
  });

  it('shares the same fallback message shape for denied and unavailable', () => {
    let errorCallback: PositionErrorCallback | undefined;
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
          errorCallback = error;
        }),
      },
    });

    const deniedRun = useGeolocation();
    deniedRun.request();
    errorCallback?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);

    const unavailableRun = useGeolocation();
    unavailableRun.request();
    errorCallback?.({ code: 3, PERMISSION_DENIED: 1 } as GeolocationPositionError);

    // Both states hand the user the same kind of manual fallback prompt —
    // neither leaves them without an explanation or a next step.
    expect(typeof deniedRun.errorMessage.value).toBe('string');
    expect(typeof unavailableRun.errorMessage.value).toBe('string');
  });
});
