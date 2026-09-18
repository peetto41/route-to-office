/**
 * Deliberate rectangular approximation of Thailand's territory, not the
 * exact border polygon — good enough to reject "wrong continent"/"wrong
 * country" input, not a precise territorial boundary. See SKILL.md's
 * "Thailand-only scope" section. `apps/web` mirrors these same four numbers
 * (not re-derived) for client-side UX feedback; this file is the canonical
 * source on the server side, which is the real enforcement boundary.
 */
export const THAILAND_BOUNDS = {
  minLat: 5.6,
  maxLat: 20.5,
  minLng: 97.3,
  maxLng: 105.7,
} as const;

/**
 * Whether `{ lat, lng }` falls within Thailand's bounding box. Used both by
 * the `IsWithinThailandBounds` class-validator decorator (for
 * directly-supplied coordinates on `POST /api/v1/route`) and available for
 * any other server-side check that needs the same rule.
 */
export function isWithinThailand(lat: number, lng: number): boolean {
  return (
    lat >= THAILAND_BOUNDS.minLat &&
    lat <= THAILAND_BOUNDS.maxLat &&
    lng >= THAILAND_BOUNDS.minLng &&
    lng <= THAILAND_BOUNDS.maxLng
  );
}
