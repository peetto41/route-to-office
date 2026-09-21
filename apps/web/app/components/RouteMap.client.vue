<script setup lang="ts">
/// <reference types="google.maps" />
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import type { GeoJsonLineString, Place } from '~/types/api';

/**
 * `.client.vue` because the Google Maps JavaScript SDK needs `window`/
 * `document` — it must never attempt to render during SSR (see
 * references/frontend-nuxt.md, though that doc still describes the
 * pre-2026-09-21 MapLibre integration; CLAUDE.md's Stack table and
 * non-negotiables are the authoritative source now).
 *
 * Route and address data still come exclusively from our own
 * `POST /api/v1/route` and `GET /api/v1/geocode` (see useRoute.ts and
 * PlacePicker.vue) — this component only renders the map itself. The Google
 * Maps JS SDK loaded here is CLAUDE.md non-negotiable 2's one permitted
 * exception to "no third-party SDK in the frontend"; it must never be used
 * to call Google's Directions or Geocoding APIs directly from the browser.
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
const map = shallowRef<google.maps.Map | null>(null);
const originMarker = shallowRef<google.maps.Marker | null>(null);
const destinationMarker = shallowRef<google.maps.Marker | null>(null);
const routePolyline = shallowRef<google.maps.Polyline | null>(null);

// Central Bangkok — a neutral default view before origin/destination/geolocation
// resolve to anything. Never treated as the actual origin or destination.
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 13.7563, lng: 100.5018 };

// This key is deliberately public and ships in the client bundle — that's
// Google's own security model for the Maps JavaScript API (lock it down with
// an HTTP-referrer restriction in Google Cloud Console), not an oversight.
// It is NOT the same kind of secret the old OpenRouteService bearer key was
// (that one could never leave the server); do not "fix" this by trying to
// move it into a server-only env var or apps/api's config. See CLAUDE.md
// non-negotiable 1 for the two-key split (this one vs.
// GOOGLE_MAPS_SERVER_API_KEY, which stays server-only in apps/api).
const googleMapsApiKey = useRuntimeConfig().public.googleMapsApiKey as string;

// Classic `google.maps.Marker` rather than `AdvancedMarkerElement`: the
// advanced marker library requires a Cloud Console-provisioned Map ID and an
// extra `importLibrary('marker')` + custom-element setup for what is, here,
// just two plain draggable colored pins — Marker gives the same drag/color
// behavior the old MapLibre markers had with far less setup. Marker is
// legacy-but-fully-supported, not deprecated-and-broken.
function createDraggableMarker(color: string): google.maps.Marker {
  return new google.maps.Marker({
    draggable: true,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    },
  });
}

function syncMarker(
  markerRef: typeof originMarker,
  place: Place | null,
  color: string,
  onDragEnd: (position: { lat: number; lng: number }) => void,
): void {
  if (!map.value) return;

  // Clearing a place (e.g. the picker's "X" button) must remove any
  // previously-placed marker too — otherwise the map keeps showing a pin at
  // the last coordinates even though the origin/destination is unset,
  // leaving stale state the user never asked to keep.
  if (!place) {
    markerRef.value?.setMap(null);
    markerRef.value = null;
    return;
  }

  if (!markerRef.value) {
    const marker = createDraggableMarker(color);
    marker.addListener('dragend', () => {
      const position = marker.getPosition();
      if (!position) return;
      onDragEnd({ lat: position.lat(), lng: position.lng() });
    });
    marker.setPosition({ lat: place.lat, lng: place.lng });
    marker.setMap(map.value);
    markerRef.value = marker;
  } else {
    markerRef.value.setPosition({ lat: place.lat, lng: place.lng });
  }
}

function buildBounds(bounds: [[number, number], [number, number]]): google.maps.LatLngBounds {
  // SKILL.md's contract: [[minLng, minLat], [maxLng, maxLat]] — Google wants
  // {lat, lng} sw/ne corners.
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  return new google.maps.LatLngBounds(
    { lat: minLat, lng: minLng },
    { lat: maxLat, lng: maxLng },
  );
}

function renderRoute(): void {
  if (!map.value) return;

  if (!props.route) {
    routePolyline.value?.setMap(null);
    routePolyline.value = null;
  } else {
    // GeoJSON LineString coordinates are [lng, lat]; google.maps wants
    // {lat, lng} — convert every point.
    const path = props.route.coordinates.map(([lng, lat]) => ({ lat, lng }));
    if (routePolyline.value) {
      routePolyline.value.setPath(path);
    } else {
      routePolyline.value = new google.maps.Polyline({
        path,
        strokeColor: '#2563eb',
        strokeOpacity: 0.85,
        strokeWeight: 5,
        map: map.value,
      });
    }
  }

  if (props.bounds) {
    map.value.fitBounds(buildBounds(props.bounds), 64);
  }
}

function syncMarkers(): void {
  syncMarker(originMarker, props.origin, '#16a34a', (position) =>
    emit('update:origin', { ...position, label: 'ตำแหน่งที่ปรับบนแผนที่' }),
  );
  syncMarker(destinationMarker, props.destination, '#dc2626', (position) =>
    emit('update:destination', { ...position, label: 'ตำแหน่งที่ปรับบนแผนที่' }),
  );
}

// Exposed so `pages/index.vue` can explicitly recenter the map when
// geolocation resolves (see references/frontend-nuxt.md's state table:
// "granted" must center the map on the returned coordinates). This is kept
// separate from `syncMarkers`/the `origin` prop watcher below so that other
// origin updates — a map click already in view, or a dragged marker — don't
// yank the viewport out from under the user. Google's SDK has no built-in
// animated `flyTo`; `panTo` + `setZoom` is the closest equivalent.
function flyTo(place: { lat: number; lng: number }): void {
  if (!map.value) return;
  map.value.panTo({ lat: place.lat, lng: place.lng });
  map.value.setZoom(14);
}

// Exposed so `pages/index.vue` can snap a dragged marker back to its last
// valid position when the drop point fails the Thailand-bounds check (the
// drag itself already moved the marker's DOM element before `dragend` fires,
// and the parent rejects the coordinate without changing `origin`/
// `destination`, so no prop change would otherwise re-trigger `syncMarkers`).
function resyncMarkers(): void {
  syncMarkers();
}

defineExpose({ flyTo, resyncMarkers });

onMounted(async () => {
  // `setOptions()`/`importLibrary()` must run only on the client: this
  // component is explicitly imported in pages/index.vue rather than
  // auto-imported, so the `.client.vue` filename suffix alone doesn't skip
  // its setup() during SSR — unlike the old MapLibre code's top-level side
  // effects, this loader touches `window` immediately, which crashes SSR if
  // called outside a lifecycle hook. `setOptions()` must run before any
  // `importLibrary()` call, but is safe to call more than once (the library
  // logs a dev-only warning and ignores repeats).
  setOptions({
    key: googleMapsApiKey,
    v: 'weekly',
  });

  // The loader's resolved promise is this SDK's equivalent of MapLibre's
  // style-readiness race: unlike raster tiles (which we don't control here —
  // Google serves its own), there's no "tiles still loading" race once the
  // `Map` is constructed, but the `Map`/`Marker`/`Polyline`/`LatLngBounds`
  // constructors don't exist on `google.maps` until the requested libraries
  // finish loading.
  await importLibrary('maps');
  await importLibrary('marker');

  // The component may have been unmounted while the above awaited.
  if (!mapContainer.value) return;

  map.value = new google.maps.Map(mapContainer.value, {
    center: props.origin ? { lat: props.origin.lat, lng: props.origin.lng } : DEFAULT_CENTER,
    zoom: 12,
    streetViewControl: false,
    fullscreenControl: false,
  });

  map.value.addListener('click', (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;
    emit('map-click', { lat: event.latLng.lat(), lng: event.latLng.lng() });
  });

  // Place the first markers/route only once the map has actually settled,
  // mirroring the old MapLibre `load`/`idle` handling rather than assuming
  // the `Map` constructor alone means it's ready to be interacted with.
  google.maps.event.addListenerOnce(map.value, 'idle', () => {
    syncMarkers();
    renderRoute();
  });
});

onBeforeUnmount(() => {
  if (map.value) {
    google.maps.event.clearInstanceListeners(map.value);
  }
  originMarker.value?.setMap(null);
  destinationMarker.value?.setMap(null);
  routePolyline.value?.setMap(null);
  map.value = null;
});

watch(() => [props.origin, props.destination], syncMarkers, { deep: true });
watch(() => [props.route, props.bounds], renderRoute, { deep: true });
</script>

<template>
  <div ref="mapContainer" class="h-full w-full min-h-[320px] rounded-xl" />
</template>
