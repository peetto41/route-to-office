import { Injectable } from '@nestjs/common';
import { UpstreamMapsException } from '../common/exceptions/upstream-maps.exception';
import { GeoJsonLineString, RouteStep } from '../route/dto/route-response.dto';
import { OrsApiError, OrsHttpClient } from './ors-http.client';

const DIRECTIONS_URL =
  'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * No `durationInTrafficSeconds` here or anywhere downstream: ORS has no
 * traffic-aware mode, `durationSeconds` is a typical-road-speed estimate.
 * See CLAUDE.md and references/openrouteservice-api.md.
 */
export interface ComputeRouteResult {
  distanceMeters: number;
  durationSeconds: number;
  route: GeoJsonLineString;
  bounds: [[number, number], [number, number]];
  steps: RouteStep[];
}

interface DirectionsApiResponse {
  features?: Array<{
    geometry?: { type?: string; coordinates?: [number, number][] };
    bbox?: [number, number, number, number];
    properties?: {
      summary?: { distance?: number; duration?: number };
      segments?: Array<{
        steps?: Array<{
          instruction?: string;
          distance?: number;
          duration?: number;
        }>;
      }>;
    };
  }>;
}

/**
 * Wraps ORS's `POST /v2/directions/driving-car/geojson`. See
 * references/openrouteservice-api.md. The `/geojson` response is already a
 * GeoJSON `FeatureCollection` — no polyline decoding needed, unlike the old
 * Google integration.
 */
@Injectable()
export class RoutesService {
  constructor(private readonly httpClient: OrsHttpClient) {}

  async computeRoute(
    origin: LatLng,
    destination: LatLng,
  ): Promise<ComputeRouteResult> {
    let response: DirectionsApiResponse;
    try {
      response = await this.httpClient.postJson<DirectionsApiResponse>(
        DIRECTIONS_URL,
        {
          // ORS coordinates are [lon, lat] — the reverse of this app's own
          // { lat, lng } DTOs. Convert explicitly here; get this backwards
          // and you get a wrong-continent route, not an error.
          coordinates: [toLonLat(origin), toLonLat(destination)],
        },
      );
    } catch (error) {
      if (error instanceof OrsApiError) {
        throw new UpstreamMapsException();
      }
      throw error;
    }

    const feature = response.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!feature || !coordinates || coordinates.length === 0) {
      throw new UpstreamMapsException(
        'The mapping service did not return a usable route.',
      );
    }

    const summary = feature.properties?.summary;

    return {
      distanceMeters: Math.round(summary?.distance ?? 0),
      durationSeconds: Math.round(summary?.duration ?? 0),
      route: { type: 'LineString', coordinates },
      bounds: toBounds(feature.bbox, coordinates),
      steps: (feature.properties?.segments ?? []).flatMap((segment) =>
        (segment.steps ?? []).map((step) => ({
          instruction: step.instruction ?? '',
          distanceMeters: Math.round(step.distance ?? 0),
          durationSeconds: Math.round(step.duration ?? 0),
        })),
      ),
    };
  }
}

function toLonLat(point: LatLng): [number, number] {
  return [point.lng, point.lat];
}

function toBounds(
  bbox: [number, number, number, number] | undefined,
  coordinates: [number, number][],
): [[number, number], [number, number]] {
  if (bbox) {
    return [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[3]],
    ];
  }
  // Fallback for the (unexpected) case ORS omits `bbox`: derive it from the
  // route's own coordinates rather than failing the whole request.
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
