export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
}

export type GeoJsonLineString = {
  type: 'LineString';
  coordinates: [number, number][];
};

/**
 * Explicit allow-list of everything `POST /api/v1/route` returns. Built
 * field-by-field from the parsed Google Directions response in
 * `google-maps/routes.service.ts` — the raw upstream payload is never passed
 * through untouched (OWASP API3: broken object property level
 * authorization).
 *
 * There is no `durationInTrafficSeconds` — the Directions request
 * deliberately never opts into Google's live-traffic-based duration model
 * (no `departure_time`/`traffic_model`). `durationSeconds` is a
 * typical-road-speed estimate; never describe it as traffic-aware anywhere in
 * code, docs, or UI copy (see CLAUDE.md).
 */
export interface RouteResponseDto {
  distanceMeters: number;
  durationSeconds: number;
  arrivalTime: string;
  route: GeoJsonLineString;
  bounds: [[number, number], [number, number]];
  steps: RouteStep[];
}
