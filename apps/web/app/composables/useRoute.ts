import { ref } from 'vue';
import type { CreateRouteRequest, RouteResponse } from '~/types/api';

/**
 * Calls `POST /api/v1/route` and holds loading/error/data state. Lives in
 * `useRoute.ts` per references/frontend-nuxt.md's suggested structure, but is
 * exported as `useRouteQuery` (not `useRoute`) — Nuxt auto-import already
 * reserves the name `useRoute` for vue-router's current-route composable, and
 * emits `[NUXT_B6002] useRoute is already auto-imported by Nuxt as a
 * built-in, and overriding it will likely cause issues` if a project
 * composable claims that name. Import this one explicitly:
 * `import { useRouteQuery } from '~/composables/useRoute'`.
 */
export function useRouteQuery() {
  const data = ref<RouteResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchRoute(request: CreateRouteRequest): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      data.value = await $fetch<RouteResponse>('/api/v1/route', {
        method: 'POST',
        body: request,
      });
    } catch {
      // Never surface the raw fetch/upstream error (could echo request data
      // or upstream details) — a static Thai message is enough for the UI.
      data.value = null;
      error.value = 'ไม่สามารถค้นหาเส้นทางได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
    } finally {
      loading.value = false;
    }
  }

  function reset(): void {
    data.value = null;
    error.value = null;
  }

  return { data, loading, error, fetchRoute, reset };
}
