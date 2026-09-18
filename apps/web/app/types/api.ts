// Mirrors the API contract in `.claude/skills/route-map-webapp/SKILL.md` for
// the four endpoints this app calls. Kept as plain types (no runtime import
// from `apps/api`) since the two apps are independently deployable.

export interface LatLng {
  lat: number;
  lng: number;
}

/** A resolved point the user can see on the map, with a human-readable label. */
export interface Place extends LatLng {
  label: string;
}

export type RouteOrigin = LatLng | { address: string };

export interface CreateRouteRequest {
  origin: RouteOrigin;
  /** Optional — omit to let the backend default to the office coordinates. */
  destination?: LatLng;
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface RouteResponse {
  distanceMeters: number;
  /** Estimate based on typical road speeds — not live traffic. */
  durationSeconds: number;
  /** Already computed server-side from the current time — never recompute this client-side. */
  arrivalTime: string;
  route: GeoJsonLineString;
  bounds: [[number, number], [number, number]];
  steps: RouteStep[];
}

export interface CompanyResponse {
  name: string;
  lat: number;
  lng: number;
}

/** One candidate coordinate returned by `GET /api/v1/geocode`. */
export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * `GET /api/v1/geocode` returns up to 5 candidates rather than auto-picking
 * one — see SKILL.md's "Thailand-only scope" / API contract sections.
 */
export interface GeocodeResponse {
  results: GeocodeResult[];
}
