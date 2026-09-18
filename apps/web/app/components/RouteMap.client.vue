<script setup lang="ts">
// maplibre-gl 6.x ships pure ESM with only named exports (no default export),
// so `import maplibregl from 'maplibre-gl'` would silently bind `undefined`.
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import type { GeoJSONSource, LngLatBoundsLike, StyleSpecification } from 'maplibre-gl';
import type { GeoJsonLineString, Place } from '~/types/api';

/**
 * `.client.vue` because MapLibre needs `window`/`document` — it must never
 * attempt to render during SSR (see references/frontend-nuxt.md).
 *
 * Tiles are requested from our own `/api/v1/tiles/{z}/{x}/{y}` proxy only —
 * never a third-party tile host directly. Tiles are always OpenStreetMap,
 * proxied by apps/api; that's an apps/api concern this component doesn't
 * need to know about.
 */

const props = defineProps<{
  origin: Place | null;
  destination: Place | null;
  route: GeoJsonLineString | null;
  bounds: [[number, number], [number, number]] | null;
}>();

const emit = defineEmits<{
  'update:origin': [value: Place];
  'update:destination': [value: Place];
  'map-click': [value: { lat: number; lng: number }];
}>();

const mapContainer = shallowRef<HTMLDivElement | null>(null);
const map = shallowRef<MapLibreMap | null>(null);
const originMarker = shallowRef<Marker | null>(null);
const destinationMarker = shallowRef<Marker | null>(null);

const ROUTE_SOURCE_ID = 'route';
const ROUTE_LAYER_ID = 'route-line';

const style: StyleSpecification = {
  version: 8,
  sources: {
    'api-tiles': {
      type: 'raster',
      tiles: ['/api/v1/tiles/{z}/{x}/{y}'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'api-tiles-layer',
      type: 'raster',
      source: 'api-tiles',
    },
  ],
};

// Central Bangkok — a neutral default view before origin/destination/geolocation
// resolve to anything. Never treated as the actual origin or destination.
const DEFAULT_CENTER: [number, number] = [100.5018, 13.7563];

function createDraggableMarker(color: string): Marker {
  return new Marker({ color, draggable: true });
}

function syncMarker(
  markerRef: typeof originMarker,
  place: Place | null,
  color: string,
  onDragEnd: (lngLat: { lat: number; lng: number }) => void,
): void {
  if (!map.value) return;

  // Clearing a place (e.g. the picker's "X" button) must remove any
  // previously-placed marker too — otherwise the map keeps showing a pin at
  // the last coordinates even though the origin/destination is unset,
  // leaving stale state the user never asked to keep.
  if (!place) {
    markerRef.value?.remove();
    markerRef.value = null;
    return;
  }

  if (!markerRef.value) {
    markerRef.value = createDraggableMarker(color);
    markerRef.value.on('dragend', () => {
      const lngLat = markerRef.value!.getLngLat();
      onDragEnd({ lat: lngLat.lat, lng: lngLat.lng });
    });
    markerRef.value.setLngLat([place.lng, place.lat]).addTo(map.value);
  } else {
    markerRef.value.setLngLat([place.lng, place.lat]);
  }
}

function renderRoute(): void {
  if (!map.value) return;
  const source = map.value.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
  const data = props.route
    ? { type: 'Feature' as const, properties: {}, geometry: props.route }
    : { type: 'FeatureCollection' as const, features: [] };

  if (source) {
    source.setData(data as never);
  } else if (props.route) {
    map.value.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: data as never });
    map.value.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': 0.85 },
    });
  }

  if (props.bounds) {
    map.value.fitBounds(props.bounds as LngLatBoundsLike, { padding: 64, maxZoom: 16 });
  }
}

function syncMarkers(): void {
  syncMarker(originMarker, props.origin, '#16a34a', (lngLat) =>
    emit('update:origin', { ...lngLat, label: 'ตำแหน่งที่ปรับบนแผนที่' }),
  );
  syncMarker(destinationMarker, props.destination, '#dc2626', (lngLat) =>
    emit('update:destination', { ...lngLat, label: 'ตำแหน่งที่ปรับบนแผนที่' }),
  );
}

// Exposed so `pages/index.vue` can explicitly recenter the map when
// geolocation resolves (see references/frontend-nuxt.md's state table:
// "granted" must center the map on the returned coordinates). This is kept
// separate from `syncMarkers`/the `origin` prop watcher below so that other
// origin updates — a map click already in view, or a dragged marker — don't
// yank the viewport out from under the user.
function flyTo(place: { lat: number; lng: number }): void {
  map.value?.flyTo({ center: [place.lng, place.lat], zoom: 14 });
}

defineExpose({ flyTo });

onMounted(() => {
  if (!mapContainer.value) return;

  map.value = new MapLibreMap({
    container: mapContainer.value,
    style,
    center: props.origin ? [props.origin.lng, props.origin.lat] : DEFAULT_CENTER,
    zoom: 12,
  });
  map.value.addControl(new NavigationControl(), 'top-right');

  map.value.on('click', (event) => {
    emit('map-click', { lat: event.lngLat.lat, lng: event.lngLat.lng });
  });

  map.value.on('load', () => {
    syncMarkers();
    renderRoute();
  });
});

onBeforeUnmount(() => {
  map.value?.remove();
});

watch(() => [props.origin, props.destination], syncMarkers, { deep: true });
watch(
  () => [props.route, props.bounds],
  () => {
    if (map.value?.isStyleLoaded()) {
      renderRoute();
    }
  },
  { deep: true },
);
</script>

<template>
  <div ref="mapContainer" class="h-full w-full min-h-[320px] rounded-xl" />
</template>
