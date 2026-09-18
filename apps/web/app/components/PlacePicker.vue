<script setup lang="ts">
import { LocateFixedIcon, MapPinIcon, SearchIcon, XIcon } from '@lucide/vue';
import { useDebounceFn } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { GeolocationState } from '~/composables/useGeolocation';
import { isWithinThailand } from '~/lib/thailand-bounds';
import type { GeocodeResponse, GeocodeResult, LatLng, Place } from '~/types/api';

/**
 * ONE component for both origin and destination — driven by `role`, not a
 * near-duplicate pair of components, per references/frontend-nuxt.md.
 *
 * The search results list is rendered with plain elements rather than the
 * shadcn-vue `Command` primitive: `Command`'s cmdk-style text-containment
 * filtering (matching against each item's own rendered text) would
 * unpredictably hide a valid server-resolved candidate whenever the user's
 * query text isn't a literal substring of its formatted address (e.g.
 * searching by a landmark name). `Input` + a manually controlled result
 * panel avoids that mismatch while keeping the same rounded, bordered
 * "search palette" look.
 */

const props = defineProps<{
  role: 'origin' | 'destination';
  modelValue: Place | null;
  geoState?: GeolocationState;
  geoErrorMessage?: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Place | null];
  'request-location': [];
}>();

const isOrigin = computed(() => props.role === 'origin');
const title = computed(() => (isOrigin.value ? 'จุดเริ่มต้น' : 'จุดหมายปลายทาง'));
const placeholder = computed(() =>
  isOrigin.value
    ? 'พิมพ์ที่อยู่ หรือพิกัด "13.7563, 100.5018"...'
    : 'พิมพ์ที่อยู่ หรือพิกัด "13.7563, 100.5018"...',
);

const query = ref('');
const searching = ref(false);
const searchError = ref<'not-found' | 'error' | 'out-of-bounds' | null>(null);
const results = ref<GeocodeResult[]>([]);
// Set instead of `results` when the typed text parses as a "lat, lng" pair —
// this path never calls GET /api/v1/geocode (see references/frontend-nuxt.md's
// "Address search" section).
const coordCandidate = ref<LatLng | null>(null);

const showLocationFallback = computed(
  () => isOrigin.value && (props.geoState === 'denied' || props.geoState === 'unavailable'),
);

// Tolerant of surrounding/inner whitespace around the comma, e.g.
// "13.7563,100.5018" or "13.7563 , 100.5018".
const COORDINATE_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

function parseCoordinatePair(value: string): LatLng | null {
  const match = COORDINATE_PATTERN.exec(value);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function resetSearchState(): void {
  searching.value = false;
  searchError.value = null;
  results.value = [];
  coordCandidate.value = null;
}

const runSearch = useDebounceFn(async (address: string) => {
  const trimmed = address.trim();
  if (trimmed.length < 3) {
    resetSearchState();
    return;
  }

  searching.value = true;
  searchError.value = null;
  results.value = [];

  try {
    // PDPA: the typed address is sent to our own API only (never logged).
    const response = await $fetch<GeocodeResponse>('/api/v1/geocode', {
      query: { address: trimmed },
    });
    results.value = response.results;
    // An empty `results` array is the normal "not found" case, not an error.
    searchError.value = response.results.length === 0 ? 'not-found' : null;
  } catch (error: unknown) {
    results.value = [];
    const status =
      typeof error === 'object' && error && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    searchError.value = status === 404 ? 'not-found' : 'error';
  } finally {
    searching.value = false;
  }
}, 400);

watch(query, (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    resetSearchState();
    return;
  }

  // A directly-typed "lat, lng" pair skips the geocode round-trip entirely —
  // validate it client-side against Thailand's bounding box instead (a UX
  // nicety; POST /api/v1/route re-validates server-side regardless).
  const coordinate = parseCoordinatePair(trimmed);
  if (coordinate) {
    searching.value = false;
    results.value = [];
    if (isWithinThailand(coordinate.lat, coordinate.lng)) {
      searchError.value = null;
      coordCandidate.value = coordinate;
    } else {
      searchError.value = 'out-of-bounds';
      coordCandidate.value = null;
    }
    return;
  }

  coordCandidate.value = null;
  searching.value = true;
  void runSearch(trimmed);
});

function selectResult(candidate: GeocodeResult): void {
  emit('update:modelValue', {
    lat: candidate.lat,
    lng: candidate.lng,
    label: candidate.formattedAddress,
  });
  query.value = '';
  resetSearchState();
}

function selectCoordinate(): void {
  if (!coordCandidate.value) return;
  const { lat, lng } = coordCandidate.value;
  emit('update:modelValue', { lat, lng, label: `พิกัด: ${lat}, ${lng}` });
  query.value = '';
  resetSearchState();
}

function clearSelection(): void {
  emit('update:modelValue', null);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-medium">{{ title }}</span>
      <Button
        v-if="isOrigin"
        type="button"
        variant="outline"
        size="sm"
        :disabled="geoState === 'requesting'"
        @click="emit('request-location')"
      >
        <Spinner v-if="geoState === 'requesting'" class="size-4" />
        <LocateFixedIcon v-else class="size-4" />
        ใช้ตำแหน่งปัจจุบัน
      </Button>
    </div>

    <Alert v-if="showLocationFallback" variant="destructive">
      <AlertDescription>{{ geoErrorMessage }}</AlertDescription>
    </Alert>

    <div v-if="modelValue" class="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
      <span class="flex min-w-0 items-center gap-2">
        <MapPinIcon class="size-4 shrink-0 text-muted-foreground" />
        <span class="truncate">{{ modelValue.label }}</span>
      </span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="ล้างตำแหน่งที่เลือก" @click="clearSelection">
        <XIcon class="size-4" />
      </Button>
    </div>

    <div v-else class="relative flex flex-col gap-1">
      <div class="relative">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="query" :placeholder="placeholder" class="pl-8" />
      </div>

      <div
        v-if="query.trim().length >= 3"
        class="rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-sm"
      >
        <div v-if="searching" class="flex items-center gap-2 px-2 py-2 text-muted-foreground">
          <Spinner class="size-4" />
          กำลังค้นหาที่อยู่...
        </div>
        <p v-else-if="searchError === 'not-found'" class="px-2 py-2 text-center text-muted-foreground">
          ไม่พบที่อยู่นี้ กรุณาลองพิมพ์ใหม่อีกครั้ง
        </p>
        <p v-else-if="searchError === 'error'" class="px-2 py-2 text-center text-destructive">
          เกิดข้อผิดพลาดในการค้นหาที่อยู่ กรุณาลองใหม่อีกครั้ง
        </p>
        <p v-else-if="searchError === 'out-of-bounds'" class="px-2 py-2 text-center text-destructive">
          กรุณาระบุพิกัดภายในประเทศไทยเท่านั้น
        </p>
        <button
          v-else-if="coordCandidate"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
          @click="selectCoordinate"
        >
          <MapPinIcon class="size-4 shrink-0 text-muted-foreground" />
          <span class="truncate">พิกัด: {{ coordCandidate.lat }}, {{ coordCandidate.lng }}</span>
        </button>
        <ul v-else-if="results.length > 0" class="flex flex-col">
          <li v-for="(candidate, index) in results" :key="`${candidate.lat}-${candidate.lng}-${index}`">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
              @click="selectResult(candidate)"
            >
              <MapPinIcon class="size-4 shrink-0 text-muted-foreground" />
              <span class="truncate">{{ candidate.formattedAddress }}</span>
            </button>
          </li>
        </ul>
      </div>

      <p v-if="isOrigin" class="text-xs text-muted-foreground">
        หรือคลิกตำแหน่งบนแผนที่เพื่อระบุจุดเริ่มต้น
      </p>
    </div>
  </div>
</template>
