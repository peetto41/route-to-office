<script setup lang="ts">
import { computed } from 'vue';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import type { RouteResponse } from '~/types/api';

/**
 * Displays `distanceMeters`, `durationSeconds`, and `arrivalTime` straight
 * from `POST /api/v1/route`'s response — the backend already anchored
 * `arrivalTime` to the request time, so this component only formats it for
 * display, never recomputes it. `durationSeconds` is a typical-road-speed
 * estimate, not live traffic — word the UI copy accordingly.
 */
const props = defineProps<{
  route: RouteResponse | null;
  loading: boolean;
  error: string | null;
}>();

const distanceLabel = computed(() => {
  if (!props.route) return null;
  const km = props.route.distanceMeters / 1000;
  return `${km.toLocaleString('th-TH', { maximumFractionDigits: 1 })} กม.`;
});

function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes.toLocaleString('th-TH')} นาที`;
}

const durationLabel = computed(() =>
  props.route ? formatMinutes(props.route.durationSeconds) : null,
);

const arrivalTimeLabel = computed(() => {
  if (!props.route) return null;
  const date = new Date(props.route.arrivalTime);
  if (Number.isNaN(date.getTime())) return props.route.arrivalTime;
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  }).format(date);
});
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>สรุปเส้นทาง</CardTitle>
      <CardDescription>ระยะทางและเวลาโดยประมาณจากจุดเริ่มต้นถึงจุดหมายปลายทาง</CardDescription>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner class="size-4" />
        กำลังค้นหาเส้นทาง...
      </div>

      <p v-else-if="error" class="text-sm text-destructive">{{ error }}</p>

      <p v-else-if="!route" class="text-sm text-muted-foreground">
        เลือกจุดเริ่มต้นและจุดหมายปลายทางเพื่อดูเส้นทาง
      </p>

      <dl v-else class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div class="flex flex-col gap-0.5">
          <dt class="text-muted-foreground">ระยะทาง</dt>
          <dd class="text-base font-medium">{{ distanceLabel }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-muted-foreground">เวลาเดินทางโดยประมาณ</dt>
          <dd class="text-base font-medium">{{ durationLabel }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-muted-foreground">เวลาถึงโดยประมาณ</dt>
          <dd class="text-base font-medium">{{ arrivalTimeLabel }}</dd>
        </div>
      </dl>
    </CardContent>
  </Card>
</template>
