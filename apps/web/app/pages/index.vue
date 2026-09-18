<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import PlacePicker from '~/components/PlacePicker.vue';
import RouteMap from '~/components/RouteMap.client.vue';
import RoutePanel from '~/components/RoutePanel.vue';
import { Button } from '~/components/ui/button';
import { useGeolocation } from '~/composables/useGeolocation';
import { useRouteQuery } from '~/composables/useRoute';
import type { CompanyResponse, Place } from '~/types/api';

useHead({ title: 'เส้นทางไปที่ทำงาน' });

const geolocation = useGeolocation();
const { data: route, loading, error, fetchRoute } = useRouteQuery();

// Both endpoints start unset and stay user-editable throughout — current
// location (once granted) and the office (from GET /api/v1/company) are only
// *defaults*, never hardcoded, per CLAUDE.md's non-negotiables.
const origin = ref<Place | null>(null);
const destination = ref<Place | null>(null);
const routeMap = ref<InstanceType<typeof RouteMap> | null>(null);

// Whether `origin` should keep following the geolocation composable's
// `coords`. True on load (so the initial grant sets the default origin) and
// re-armed whenever the user explicitly presses "ใช้ตำแหน่งปัจจุบัน" again;
// set back to false the moment the user overrides the origin some other way
// (map click, drag, or address search), so a later geolocation update
// doesn't silently clobber a manual choice.
const followGeolocationForOrigin = ref(true);

const { data: company } = await useFetch<CompanyResponse>('/api/v1/company');

watch(
  company,
  (value) => {
    if (value && !destination.value) {
      destination.value = { lat: value.lat, lng: value.lng, label: value.name };
    }
  },
  { immediate: true },
);

// PDPA: `coords` only ever lives in this in-memory ref — never written to
// localStorage/cookies/analytics, never console.logged.
watch(geolocation.coords, (coords) => {
  if (coords && followGeolocationForOrigin.value) {
    origin.value = { ...coords, label: 'ตำแหน่งปัจจุบันของคุณ' };
    routeMap.value?.flyTo(coords);
  }
});

onMounted(() => {
  // Default the origin to the user's current location — the geolocation
  // composable's 5-state machine (idle/requesting/granted/denied/unavailable)
  // still lets the user override via PlacePicker's search box or a map click
  // regardless of the outcome.
  geolocation.request();
});

function requestCurrentLocationOrigin(): void {
  followGeolocationForOrigin.value = true;
  geolocation.request();
}

function setManualOrigin(value: Place | null): void {
  followGeolocationForOrigin.value = false;
  origin.value = value;
}

function handleMapClick(point: { lat: number; lng: number }): void {
  if (!origin.value) {
    setManualOrigin({ ...point, label: 'ตำแหน่งที่เลือกบนแผนที่' });
  } else if (!destination.value) {
    destination.value = { ...point, label: 'ตำแหน่งที่เลือกบนแผนที่' };
  }
}

function runFetchRoute(): void {
  if (!origin.value || !destination.value) return;
  void fetchRoute({
    origin: { lat: origin.value.lat, lng: origin.value.lng },
    destination: { lat: destination.value.lat, lng: destination.value.lng },
  });
}

watch([origin, destination], runFetchRoute);
</script>

<template>
  <div class="flex h-dvh flex-col md:flex-row">
    <aside class="flex w-full flex-col gap-4 overflow-y-auto border-b p-4 md:w-96 md:border-r md:border-b-0">
      <h1 class="text-lg font-semibold">เส้นทางไปที่ทำงาน</h1>

      <PlacePicker
        role="origin"
        :model-value="origin"
        :geo-state="geolocation.state.value"
        :geo-error-message="geolocation.errorMessage.value"
        @update:model-value="setManualOrigin"
        @request-location="requestCurrentLocationOrigin"
      />

      <PlacePicker
        role="destination"
        :model-value="destination"
        @update:model-value="(value) => (destination = value)"
      />

      <Button
        type="button"
        :disabled="!origin || !destination || loading"
        @click="runFetchRoute"
      >
        ค้นหาเส้นทาง
      </Button>

      <RoutePanel :route="route" :loading="loading" :error="error" />
    </aside>

    <main class="relative flex-1">
      <RouteMap
        ref="routeMap"
        :origin="origin"
        :destination="destination"
        :route="route?.route ?? null"
        :bounds="route?.bounds ?? null"
        @update:origin="setManualOrigin"
        @update:destination="(value) => (destination = value)"
        @map-click="handleMapClick"
      />
    </main>
  </div>
</template>
