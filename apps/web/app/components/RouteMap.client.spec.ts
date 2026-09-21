import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RouteMap from './RouteMap.client.vue';
import type { GeoJsonLineString } from '~/types/api';

/**
 * Minimal `google.maps` mock covering just the surface RouteMap.client.vue
 * drives:
 *  - `Map` (constructor, `addListener`, `fitBounds`, `panTo`, `setZoom`)
 *  - `Marker` (constructor, `setPosition`, `setMap`, `addListener`,
 *    `getPosition`)
 *  - `Polyline` (constructor, `setPath`, `setMap`)
 *  - `LatLngBounds` (constructor)
 *  - `SymbolPath` (used for the marker icon) and the free functions
 *    `google.maps.event.addListenerOnce` / `clearInstanceListeners`.
 *
 * `@googlemaps/js-api-loader`'s `setOptions()`/`importLibrary()` functional
 * API is mocked — `importLibrary()` resolves immediately (a real browser
 * fetches the SDK via a script tag, which doesn't exist under happy-dom) —
 * so `onMounted`'s two `await`s just need to resolve, after which the
 * component reads the mocked `google.maps.*` constructors assigned to
 * `globalThis.google` below, exactly as the real loader would have
 * populated the global `google` object.
 */

const { MockMap, MockMarker, MockPolyline, MockLatLngBounds } = vi.hoisted(() => {
  class MockMap {
    static instances: MockMap[] = [];
    options: unknown;
    handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    fitBounds = vi.fn();
    panTo = vi.fn();
    setZoom = vi.fn();
    addListener = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      (this.handlers[event] ??= []).push(cb);
    });

    constructor(_container: HTMLElement, options: unknown) {
      this.options = options;
      MockMap.instances.push(this);
    }

    emit(event: string, ...args: unknown[]): void {
      this.handlers[event]?.forEach((cb) => cb(...args));
    }
  }

  class MockMarker {
    static instances: MockMarker[] = [];
    position: { lat: number; lng: number } | null = null;
    handlers: Record<string, Array<() => void>> = {};
    setMap = vi.fn();
    setPosition = vi.fn((position: { lat: number; lng: number }) => {
      this.position = position;
    });
    getPosition = vi.fn(() =>
      this.position ? { lat: () => this.position!.lat, lng: () => this.position!.lng } : null,
    );
    addListener = vi.fn((event: string, cb: () => void) => {
      (this.handlers[event] ??= []).push(cb);
    });

    constructor(_options: unknown) {
      MockMarker.instances.push(this);
    }

    // Test helper: simulates a drag by moving the marker then firing dragend,
    // mirroring the real SDK's behavior that the DOM position moves before
    // the event fires.
    dragTo(position: { lat: number; lng: number }): void {
      this.position = position;
      this.handlers.dragend?.forEach((cb) => cb());
    }
  }

  class MockPolyline {
    static instances: MockPolyline[] = [];
    path: unknown;
    setPath = vi.fn((path: unknown) => {
      this.path = path;
    });
    setMap = vi.fn();

    constructor(options: { path: unknown }) {
      this.path = options.path;
      MockPolyline.instances.push(this);
    }
  }

  class MockLatLngBounds {
    constructor(
      public sw: { lat: number; lng: number },
      public ne: { lat: number; lng: number },
    ) {}
  }

  return { MockMap, MockMarker, MockPolyline, MockLatLngBounds };
});

const addListenerOnceHandlers = vi.hoisted(() => new Map<unknown, Record<string, () => void>>());

vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(() => Promise.resolve({})),
}));

beforeEach(() => {
  MockMap.instances.length = 0;
  MockMarker.instances.length = 0;
  MockPolyline.instances.length = 0;
  addListenerOnceHandlers.clear();

  vi.stubGlobal('google', {
    maps: {
      Map: MockMap,
      Marker: MockMarker,
      Polyline: MockPolyline,
      LatLngBounds: MockLatLngBounds,
      SymbolPath: { CIRCLE: 0 },
      event: {
        addListenerOnce: vi.fn((instance: unknown, event: string, cb: () => void) => {
          const handlers = addListenerOnceHandlers.get(instance) ?? {};
          handlers[event] = cb;
          addListenerOnceHandlers.set(instance, handlers);
        }),
        clearInstanceListeners: vi.fn(),
      },
    },
  });

  // `useRuntimeConfig` is a Nuxt auto-import, not a real global under plain
  // vitest (this suite doesn't run through @nuxt/test-utils) — stub it so
  // the component's top-level `useRuntimeConfig().public.googleMapsApiKey`
  // read resolves to a fixed test value instead of throwing.
  vi.stubGlobal('useRuntimeConfig', () => ({
    public: { googleMapsApiKey: 'test-google-maps-api-key' },
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const route: GeoJsonLineString = {
  type: 'LineString',
  coordinates: [
    [100.5, 13.7],
    [100.6, 13.8],
  ],
};
const bounds: [[number, number], [number, number]] = [
  [100.5, 13.7],
  [100.6, 13.8],
];

const baseProps = { origin: null, destination: null, route: null, bounds: null };

function latestMap(): InstanceType<typeof MockMap> {
  const instance = MockMap.instances.at(-1);
  if (!instance) throw new Error('no MockMap instance was created');
  return instance;
}

// Fires the map's one-time 'idle' listener, mirroring the real SDK settling
// after construction — RouteMap.client.vue defers the first marker/route
// render until this fires (see the component's onMounted comment).
function settleMap(map: InstanceType<typeof MockMap>): void {
  addListenerOnceHandlers.get(map)?.idle?.();
}

describe('RouteMap.client.vue', () => {
  it('renders the route as a Polyline and fits the map to bounds once the map settles', async () => {
    const wrapper = mount(RouteMap, { props: baseProps });
    await flushPromises();
    settleMap(latestMap());

    await wrapper.setProps({ route, bounds });

    expect(MockPolyline.instances).toHaveLength(1);
    // GeoJSON [lng, lat] pairs converted to Google's {lat, lng}.
    expect(MockPolyline.instances[0]?.path).toEqual([
      { lat: 13.7, lng: 100.5 },
      { lat: 13.8, lng: 100.6 },
    ]);
    const map = latestMap();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    const [boundsArg, paddingArg] = map.fitBounds.mock.calls[0]!;
    expect(boundsArg).toBeInstanceOf(MockLatLngBounds);
    expect((boundsArg as InstanceType<typeof MockLatLngBounds>).sw).toEqual({ lat: 13.7, lng: 100.5 });
    expect((boundsArg as InstanceType<typeof MockLatLngBounds>).ne).toEqual({ lat: 13.8, lng: 100.6 });
    expect(paddingArg).toBe(64);
  });

  it('places a draggable marker for the origin and emits update:origin on drag', async () => {
    const wrapper = mount(RouteMap, {
      props: { ...baseProps, origin: { lat: 13.7, lng: 100.5, label: 'A' } },
    });
    await flushPromises();
    settleMap(latestMap());
    await wrapper.vm.$nextTick();

    expect(MockMarker.instances).toHaveLength(1);
    const marker = MockMarker.instances[0]!;

    marker.dragTo({ lat: 13.75, lng: 100.55 });

    expect(wrapper.emitted('update:origin')?.[0]?.[0]).toEqual({
      lat: 13.75,
      lng: 100.55,
      label: 'ตำแหน่งที่ปรับบนแผนที่',
    });
  });

  it('removes the marker when its place is cleared', async () => {
    const wrapper = mount(RouteMap, {
      props: { ...baseProps, origin: { lat: 13.7, lng: 100.5, label: 'A' } },
    });
    await flushPromises();
    settleMap(latestMap());
    await wrapper.vm.$nextTick();

    const marker = MockMarker.instances[0]!;
    await wrapper.setProps({ origin: null });

    expect(marker.setMap).toHaveBeenCalledWith(null);
  });

  it('emits map-click with the clicked lat/lng', async () => {
    const wrapper = mount(RouteMap, { props: baseProps });
    await flushPromises();
    const map = latestMap();
    settleMap(map);

    map.emit('click', { latLng: { lat: () => 13.9, lng: () => 100.9 } });

    expect(wrapper.emitted('map-click')?.[0]?.[0]).toEqual({ lat: 13.9, lng: 100.9 });
  });

  it('exposes flyTo() (panTo + setZoom) and resyncMarkers() (re-applies current props)', async () => {
    const wrapper = mount(RouteMap, {
      props: { ...baseProps, origin: { lat: 13.7, lng: 100.5, label: 'A' } },
    });
    await flushPromises();
    settleMap(latestMap());
    await wrapper.vm.$nextTick();

    const map = latestMap();
    const exposed = wrapper.vm as unknown as {
      flyTo: (place: { lat: number; lng: number }) => void;
      resyncMarkers: () => void;
    };

    exposed.flyTo({ lat: 13.8, lng: 100.6 });
    expect(map.panTo).toHaveBeenCalledWith({ lat: 13.8, lng: 100.6 });
    expect(map.setZoom).toHaveBeenCalledWith(14);

    const marker = MockMarker.instances[0]!;
    marker.setPosition.mockClear();
    exposed.resyncMarkers();
    expect(marker.setPosition).toHaveBeenCalledWith({ lat: 13.7, lng: 100.5 });
  });
});
