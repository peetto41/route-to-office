import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RouteMap from './RouteMap.client.vue';
import type { GeoJsonLineString } from '~/types/api';

/**
 * Regression coverage for the `renderRouteWhenReady()` race-condition fix
 * (see the long comment above that function in RouteMap.client.vue):
 * `props.route` can resolve before MapLibre's style is ready to accept
 * `addSource`/`addLayer` (`map.isStyleLoaded()` false). Previously the watcher
 * checked `isStyleLoaded()` exactly once and silently dropped the update
 * forever if it was false. The fix retries via `map.once('idle', ...)`,
 * recursing until the style is actually ready, and guards against stacking
 * duplicate `idle` listeners if another update lands while one is already
 * pending.
 *
 * A real MapLibre GL `Map` needs a WebGL context that doesn't exist under
 * happy-dom, so `maplibre-gl` is mocked with just enough surface for the
 * component to drive: `isStyleLoaded`, `on`/`once`, `addSource`, `addLayer`,
 * `getSource`, `fitBounds`, `flyTo`, `remove`, `addControl`.
 */

const { MockMap, MockMarker, mapInstances } = vi.hoisted(() => {
  class MockMap {
    static instances: MockMap[] = [];

    options: unknown;
    isStyleLoaded = vi.fn(() => true);
    handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    onceHandlers: Record<string, Array<() => void>> = {};
    sources: Record<string, { data: unknown; setData: ReturnType<typeof vi.fn> }> = {};
    layers: unknown[] = [];
    on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      (this.handlers[event] ??= []).push(cb);
    });
    once = vi.fn((event: string, cb: () => void) => {
      (this.onceHandlers[event] ??= []).push(cb);
    });
    fitBounds = vi.fn();
    flyTo = vi.fn();
    remove = vi.fn();
    addControl = vi.fn();

    constructor(options: unknown) {
      this.options = options;
      MockMap.instances.push(this);
    }

    addSource(id: string, source: { data: unknown }): void {
      this.sources[id] = { data: source.data, setData: vi.fn() };
    }

    getSource(id: string) {
      return this.sources[id];
    }

    addLayer(layer: unknown): void {
      this.layers.push(layer);
    }

    // Test helper: fires a regular (repeatable) event, e.g. 'load'/'click'.
    emit(event: string): void {
      this.handlers[event]?.forEach((cb) => cb());
    }

    // Test helper: fires and clears all pending once() listeners for an
    // event, mirroring MapLibre's real once() semantics.
    emitOnce(event: string): void {
      const callbacks = this.onceHandlers[event] ?? [];
      this.onceHandlers[event] = [];
      callbacks.forEach((cb) => cb());
    }
  }

  class MockMarker {
    addTo = vi.fn(() => this);
    setLngLat = vi.fn(() => this);
    getLngLat = vi.fn(() => ({ lat: 0, lng: 0 }));
    on = vi.fn(() => this);
    remove = vi.fn(() => this);
  }

  return { MockMap, MockMarker, mapInstances: MockMap.instances as MockMap[] };
});

vi.mock('maplibre-gl', () => ({
  Map: MockMap,
  Marker: MockMarker,
  NavigationControl: class MockNavigationControl {
    onAdd = vi.fn(() => document.createElement('div'));
  },
}));

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

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

const otherRoute: GeoJsonLineString = {
  type: 'LineString',
  coordinates: [
    [100.51, 13.71],
    [100.62, 13.82],
  ],
};
const otherBounds: [[number, number], [number, number]] = [
  [100.51, 13.71],
  [100.62, 13.82],
];

const baseProps = { origin: null, destination: null, route: null, bounds: null };

function latestMap(): InstanceType<typeof MockMap> {
  const instance = mapInstances.at(-1);
  if (!instance) throw new Error('no MockMap instance was created');
  return instance;
}

describe('RouteMap.client.vue — renderRouteWhenReady race condition', () => {
  beforeEach(() => {
    MockMap.instances.length = 0;
  });

  it('renders the route immediately when the style is already loaded', async () => {
    const wrapper = mount(RouteMap, { props: baseProps });
    const map = latestMap();
    map.isStyleLoaded.mockReturnValue(true);

    await wrapper.setProps({ route, bounds });

    expect(map.sources.route).toBeDefined();
    expect(map.layers).toHaveLength(1);
    expect(map.fitBounds).toHaveBeenCalledWith(bounds, { padding: 64, maxZoom: 16 });
  });

  it('defers rendering when the style is not ready, and completes it once the map goes idle', async () => {
    const wrapper = mount(RouteMap, { props: baseProps });
    const map = latestMap();
    map.isStyleLoaded.mockReturnValue(false);

    await wrapper.setProps({ route, bounds });

    // Not silently dropped, but not rendered yet either — deferred via a
    // one-time 'idle' listener.
    expect(map.sources.route).toBeUndefined();
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.once).toHaveBeenCalledTimes(1);
    expect(map.once).toHaveBeenCalledWith('idle', expect.any(Function));

    // The map catches up: style finishes loading, and settles ('idle').
    map.isStyleLoaded.mockReturnValue(true);
    map.emitOnce('idle');

    expect(map.sources.route).toBeDefined();
    expect(map.layers).toHaveLength(1);
    expect(map.fitBounds).toHaveBeenCalledWith(bounds, { padding: 64, maxZoom: 16 });
  });

  it('does not stack duplicate idle listeners when another update lands before the style settles', async () => {
    const wrapper = mount(RouteMap, { props: baseProps });
    const map = latestMap();
    map.isStyleLoaded.mockReturnValue(false);

    await wrapper.setProps({ route, bounds });
    expect(map.once).toHaveBeenCalledTimes(1);

    // A second update (e.g. destination changed again) lands while the style
    // is still not ready — the `routeRenderPending` guard must skip
    // registering a second 'idle' listener.
    await wrapper.setProps({ route: otherRoute, bounds: otherBounds });
    expect(map.once).toHaveBeenCalledTimes(1);

    map.isStyleLoaded.mockReturnValue(true);
    map.emitOnce('idle');

    // Renders once, using the latest route/bounds rather than the stale first one.
    expect(map.sources.route).toBeDefined();
    expect(map.layers).toHaveLength(1);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenCalledWith(otherBounds, { padding: 64, maxZoom: 16 });

    // Nothing was left dangling: a further prop change after settling can
    // still register a fresh listener on its own, independent of the guard
    // from the previous cycle.
    map.isStyleLoaded.mockReturnValue(false);
    await wrapper.setProps({ route, bounds });
    expect(map.once).toHaveBeenCalledTimes(2);
  });
});
