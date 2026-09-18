/**
 * Deliberate rectangular approximation of Thailand's territory, not the
 * exact border polygon — good enough to reject "wrong continent"/"wrong
 * country" input, not a precise territorial boundary. See SKILL.md's
 * "Thailand-only scope" section. These are the same four numbers as
 * `apps/api/src/common/thailand-bounds.constants.ts` (not re-derived) — this
 * copy is for client-side UX feedback only, never the real enforcement
 * boundary. `POST /api/v1/route` rejects out-of-Thailand coordinates
 * server-side regardless of what this file allows through.
 */
export const THAILAND_BOUNDS = {
  minLat: 5.6,
  maxLat: 20.5,
  minLng: 97.3,
  maxLng: 105.7,
} as const;

/** Whether `{ lat, lng }` falls within Thailand's bounding box. */
export function isWithinThailand(lat: number, lng: number): boolean {
  return (
    lat >= THAILAND_BOUNDS.minLat &&
    lat <= THAILAND_BOUNDS.maxLat &&
    lng >= THAILAND_BOUNDS.minLng &&
    lng <= THAILAND_BOUNDS.maxLng
  );
}
