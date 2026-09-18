import { ref } from 'vue';
import type { LatLng } from '~/types/api';

/**
 * The 5-state geolocation machine documented at the end of
 * references/frontend-nuxt.md. Deliberately never collapsed to a bare
 * lat/lng-or-null — `denied` and `unavailable` are distinct states that both
 * route the UI to the same manual fallback (address search / click-on-map),
 * per that table.
 */
export type GeolocationState =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable';

const DENIED_MESSAGE =
  'คุณปฏิเสธการเข้าถึงตำแหน่ง กรุณาพิมพ์ที่อยู่หรือคลิกบนแผนที่เพื่อระบุจุดเริ่มต้นแทน';
const UNAVAILABLE_MESSAGE =
  'ไม่สามารถระบุตำแหน่งปัจจุบันได้ในขณะนี้ กรุณาพิมพ์ที่อยู่หรือคลิกบนแผนที่เพื่อระบุจุดเริ่มต้นแทน';

export function useGeolocation() {
  const state = ref<GeolocationState>('idle');
  const coords = ref<LatLng | null>(null);
  // PDPA: this holds only a static, non-identifying Thai UI string (never the
  // coordinates or a raw browser error message) — safe to keep in memory and
  // never written to localStorage/cookies/console.
  const errorMessage = ref<string | null>(null);

  function request(): void {
    if (state.value === 'requesting') {
      return;
    }

    // Guard for SSR — `navigator` doesn't exist in Nitro's server runtime,
    // and this composable/its state machine must still be importable in
    // non-`.client` files without crashing during server render.
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      state.value = 'unavailable';
      errorMessage.value = UNAVAILABLE_MESSAGE;
      return;
    }

    state.value = 'requesting';
    errorMessage.value = null;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        coords.value = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        state.value = 'granted';
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          state.value = 'denied';
          errorMessage.value = DENIED_MESSAGE;
        } else {
          // POSITION_UNAVAILABLE or TIMEOUT
          state.value = 'unavailable';
          errorMessage.value = UNAVAILABLE_MESSAGE;
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  return { state, coords, errorMessage, request };
}
