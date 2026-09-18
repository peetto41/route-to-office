<script setup lang="ts">
import { LocateFixedIcon, MapPinIcon, SearchIcon, XIcon } from '@lucide/vue';
import { useDebounceFn } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { GeolocationState } from '~/composables/useGeolocation';
import type { GeocodeResponse, Place } from '~/types/api';

/**
 * ONE component for both origin and destination — driven by `role`, not a
 * near-duplicate pair of components, per references/frontend-nuxt.md.
 *
 * The search results list is rendered with plain elements rather than the
 * shadcn-vue `Command` primitive: `GET /api/v1/geocode` resolves a typed
 * address to at most one coordinate (see SKILL.md), it isn't a client-side
 * list to fuzzy-filter — `Command`'s cmdk-style text-containment filtering
 * (matching against each item's own rendered text) would unpredictably hide
 * a valid single server-resolved result whenever the user's query text isn't
 * a literal substring of the resolved formatted address (e.g. searching by
 * a landmark name). `Input` + a manually controlled result panel avoids that
 * mismatch while keeping the same rounded, bordered "search palette" look.
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
  isOrigin.value ? 'พิมพ์ที่อยู่จุดเริ่มต้น...' : 'พิมพ์ที่อยู่จุดหมายปลายทาง...',
);

const query = ref('');
const searching = ref(false);
const searchError = ref<'not-found' | 'error' | null>(null);
const result = ref<GeocodeResponse | null>(null);

const showLocationFallback = computed(
  () => isOrigin.value && (props.geoState === 'denied' || props.geoState === 'unavailable'),
);

const runSearch = useDebounceFn(async (address: string) => {
  const trimmed = address.trim();
  if (trimmed.length < 3) {
    searching.value = false;
    searchError.value = null;
    result.value = null;
    return;
  }

  searching.value = true;
  searchError.value = null;
  result.value = null;

  try {
    // PDPA: the typed address is sent to our own API only (never logged).
    result.value = await $fetch<GeocodeResponse>('/api/v1/geocode', {
      query: { address: trimmed },
    });
  } catch (error: unknown) {
    result.value = null;
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
  if (!value.trim()) {
    searching.value = false;
    searchError.value = null;
    result.value = null;
    return;
  }
  searching.value = true;
  void runSearch(value);
});

function selectResult(): void {
  if (!result.value) return;
  emit('update:modelValue', {
    lat: result.value.lat,
    lng: result.value.lng,
    label: result.value.formattedAddress,
  });
  query.value = '';
  result.value = null;
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
        <button
          v-else-if="result"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
          @click="selectResult"
        >
          <MapPinIcon class="size-4 shrink-0 text-muted-foreground" />
          <span class="truncate">{{ result.formattedAddress }}</span>
        </button>
      </div>

      <p v-if="isOrigin" class="text-xs text-muted-foreground">
        หรือคลิกตำแหน่งบนแผนที่เพื่อระบุจุดเริ่มต้น
      </p>
    </div>
  </div>
</template>
