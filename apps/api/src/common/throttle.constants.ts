/**
 * Tight per-route override applied to per-user-action endpoints that reach
 * OpenRouteService (`POST /route`, `GET /geocode`) — see
 * references/backend-nestjs.md's "Rate limiting (throttler)" section. Kept
 * separate from the generous module-wide default configured in
 * `app.module.ts` so a client can't burn through the account's ORS plan
 * quota. `GET /company` deliberately does not use this constant, and neither
 * does `GET /tiles/:z/:x/:y` — see `TILE_THROTTLE` below.
 */
export const ORS_THROTTLE = { limit: 10, ttl: 60_000 };

/**
 * Separate, much higher override for `GET /tiles/:z/:x/:y` — see
 * references/backend-nestjs.md's "Rate limiting (throttler)" section. Unlike
 * `POST /route` and `GET /geocode`, this endpoint is not a per-user-action
 * call: a single map viewport legitimately fires dozens of tile requests,
 * and panning/zooming fires many more. Reusing `ORS_THROTTLE` here 429s
 * normal map use into visible gaps in the tile grid. This still caps abuse
 * (OSM's usage policy expects reasonable, not unlimited, request volume),
 * just sized for "a browser panning a map" rather than "a user submitting a
 * form."
 */
export const TILE_THROTTLE = { limit: 300, ttl: 60_000 };
