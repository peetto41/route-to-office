import { Injectable } from '@nestjs/common';
import { UpstreamMapsException } from '../common/exceptions/upstream-maps.exception';
import { GeoJsonLineString, RouteStep } from '../route/dto/route-response.dto';
import {
  GoogleMapsApiError,
  GoogleMapsHttpClient,
} from './google-maps-http.client';
import { decodePolyline } from './polyline.util';

const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * No `durationInTrafficSeconds` here or anywhere downstream: this request
 * deliberately never opts into Google's live-traffic-based duration model
 * (see `computeRoute`'s doc comment) — `durationSeconds` is a
 * typical-road-speed estimate. See CLAUDE.md.
 */
export interface ComputeRouteResult {
  distanceMeters: number;
  durationSeconds: number;
  route: GeoJsonLineString;
  bounds: [[number, number], [number, number]];
  steps: RouteStep[];
}

interface DirectionsApiLeg {
  distance?: { value?: number };
  duration?: { value?: number };
  steps?: Array<{
    html_instructions?: string;
    distance?: { value?: number };
    duration?: { value?: number };
  }>;
}

interface DirectionsApiRoute {
  overview_polyline?: { points?: string };
  bounds?: {
    northeast?: { lat?: number; lng?: number };
    southwest?: { lat?: number; lng?: number };
  };
  legs?: DirectionsApiLeg[];
}

interface DirectionsApiResponse {
  status?: string;
  routes?: DirectionsApiRoute[];
}

/**
 * Wraps Google's `GET /maps/api/directions/json` (mode=driving). Unlike the
 * previous OpenRouteService integration, this response is not GeoJSON: the
 * route geometry arrives as an encoded polyline (`overview_polyline.points`,
 * decoded via `polyline.util.ts`) and each step's instruction arrives as an
 * HTML fragment (`html_instructions`, stripped of tags here) rather than
 * plain text.
 */
@Injectable()
export class RoutesService {
  constructor(private readonly httpClient: GoogleMapsHttpClient) {}

  async computeRoute(
    origin: LatLng,
    destination: LatLng,
  ): Promise<ComputeRouteResult> {
    let response: DirectionsApiResponse;
    try {
      response = await this.httpClient.getJson<DirectionsApiResponse>(
        DIRECTIONS_URL,
        {
          origin: toLatLngParam(origin),
          destination: toLatLngParam(destination),
          mode: 'driving',
          // Deliberately no `departure_time` (and therefore no
          // `traffic_model`): passing `departure_time=now` is what would opt
          // this call into Google's live-traffic-based ETA. Omitting it
          // keeps `duration` a typical-conditions estimate — never describe
          // this as traffic-aware anywhere (CLAUDE.md non-negotiable).
        },
      );
    } catch (error) {
      if (error instanceof GoogleMapsApiError) {
        throw new UpstreamMapsException();
      }
      throw error;
    }

    // Google returns HTTP 200 even for a logical failure and signals it via
    // `status` instead (OK, ZERO_RESULTS, NOT_FOUND, OVER_QUERY_LIMIT,
    // REQUEST_DENIED, INVALID_REQUEST, ...). `ZERO_RESULTS` here means no
    // drivable route exists between two otherwise-valid points — mirrors how
    // the old ORS integration treated an empty `features` array: a generic
    // upstream failure, not a client input error (the input coordinates
    // themselves were already validated/geocoded upstream of this call).
    if (response.status !== 'OK') {
      throw new UpstreamMapsException(
        'The mapping service did not return a usable route.',
      );
    }

    const route = response.routes?.[0];
    const points = route?.overview_polyline?.points;
    if (!route || !points) {
      throw new UpstreamMapsException(
        'The mapping service did not return a usable route.',
      );
    }

    const coordinates = decodePolyline(points);
    if (coordinates.length === 0) {
      throw new UpstreamMapsException(
        'The mapping service did not return a usable route.',
      );
    }

    let distanceMeters = 0;
    let durationSeconds = 0;
    const steps: RouteStep[] = [];
    for (const leg of route.legs ?? []) {
      distanceMeters += leg.distance?.value ?? 0;
      durationSeconds += leg.duration?.value ?? 0;
      for (const step of leg.steps ?? []) {
        steps.push({
          instruction: stripHtml(step.html_instructions ?? ''),
          distanceMeters: Math.round(step.distance?.value ?? 0),
          durationSeconds: Math.round(step.duration?.value ?? 0),
        });
      }
    }

    return {
      distanceMeters: Math.round(distanceMeters),
      durationSeconds: Math.round(durationSeconds),
      route: { type: 'LineString', coordinates },
      bounds: toBounds(route.bounds, coordinates),
      steps,
    };
  }
}

function toLatLngParam(point: LatLng): string {
  return `${point.lat},${point.lng}`;
}

/**
 * Google's step instructions arrive as an HTML fragment (e.g. `Head
 * <b>south</b> on <b>Rama I Rd</b>`) — strip tags so this app's `steps`
 * contract carries plain text, matching what the old ORS integration already
 * returned natively.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function toBounds(
  bounds: DirectionsApiRoute['bounds'],
  coordinates: [number, number][],
): [[number, number], [number, number]] {
  if (bounds?.southwest && bounds?.northeast) {
    const { southwest, northeast } = bounds;
    if (
      typeof southwest.lng === 'number' &&
      typeof southwest.lat === 'number' &&
      typeof northeast.lng === 'number' &&
      typeof northeast.lat === 'number'
    ) {
      return [
        [southwest.lng, southwest.lat],
        [northeast.lng, northeast.lat],
      ];
    }
  }
  // Fallback for the (unexpected) case Google omits `bounds`: derive it from
  // the route's own coordinates rather than failing the whole request.
  let minLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLng = coordinates[0][0];
  let maxLat = coordinates[0][1];
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
