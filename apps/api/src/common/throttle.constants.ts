/**
 * Tight per-route override applied to per-user-action endpoints that reach
 * Google Maps Platform (`POST /route`, `GET /geocode`) — see
 * references/backend-nestjs.md's "Rate limiting (throttler)" section. Kept
 * separate from the generous module-wide default configured in
 * `app.module.ts` so a client can't burn through the account's Google Maps
 * Platform quota. `GET /company` deliberately does not use this constant.
 *
 * Retained its original `ORS_THROTTLE` name from the OpenRouteService
 * integration this app used before migrating to Google Maps Platform — the
 * constant's purpose (a tight, per-user-action throttle) is unchanged, only
 * the upstream provider it's protecting is different now.
 */
export const ORS_THROTTLE = { limit: 10, ttl: 60_000 };
